import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from .models import Chat, Message, Profile

class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        
        # Reject connection if user is not authenticated
        if not self.user or self.user.is_anonymous:
            await self.close()
            return
            
        # Accept the connection
        await self.accept()
        
        # User-specific channel group (for invites, direct notifications)
        self.user_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(
            self.user_group,
            self.channel_name
        )
        
        # Find all chats this user is a member of and join their groups
        self.chat_ids = await self.get_user_chats()
        for chat_id in self.chat_ids:
            await self.channel_layer.group_add(
                f"chat_{chat_id}",
                self.channel_name
            )
            
        # Set online status
        await self.set_online_status(True)

    async def disconnect(self, close_code):
        if hasattr(self, 'user') and not self.user.is_anonymous:
            # Leave user-specific group
            await self.channel_layer.group_discard(
                self.user_group,
                self.channel_name
            )
            
            # Leave all chat groups
            if hasattr(self, 'chat_ids'):
                for chat_id in self.chat_ids:
                    await self.channel_layer.group_discard(
                        f"chat_{chat_id}",
                        self.channel_name
                    )
            
            # Set offline status
            await self.set_online_status(False)

    async def receive_json(self, content):
        action = content.get("action")
        
        if action == "send_message":
            chat_id = content.get("chat_id")
            message_text = content.get("content")
            
            if chat_id and message_text:
                msg_data = await self.save_message(chat_id, message_text)
                if msg_data:
                    # Broadcast message to the chat group
                    await self.channel_layer.group_send(
                        f"chat_{chat_id}",
                        {
                            "type": "chat_message",
                            "message": msg_data
                        }
                    )
                    
        elif action == "typing":
            chat_id = content.get("chat_id")
            is_typing = content.get("is_typing", False)
            
            if chat_id:
                # Broadcast typing status to chat group
                await self.channel_layer.group_send(
                    f"chat_{chat_id}",
                    {
                        "type": "chat_typing",
                        "chat_id": chat_id,
                        "user_id": self.user.id,
                        "username": self.user.username,
                        "is_typing": is_typing
                    }
                )
                
        elif action == "read_messages":
            chat_id = content.get("chat_id")
            
            if chat_id:
                success = await self.mark_messages_read(chat_id)
                if success:
                    # Broadcast read confirmation to chat group
                    await self.channel_layer.group_send(
                        f"chat_{chat_id}",
                        {
                            "type": "chat_read",
                            "chat_id": chat_id,
                            "reader_id": self.user.id
                        }
                    )
        
        elif action == "join_chat_group":
            # Allow client to dynamically subscribe to a new chat's channel group
            chat_id = content.get("chat_id")
            if chat_id:
                # Verify membership
                is_member = await self.verify_chat_membership(chat_id)
                if is_member:
                    await self.channel_layer.group_add(
                        f"chat_{chat_id}",
                        self.channel_name
                    )
                    # Keep track in active session list
                    if chat_id not in self.chat_ids:
                        self.chat_ids.append(chat_id)

    # Broadcast event handlers
    async def chat_message(self, event):
        await self.send_json({
            "type": "message",
            "message": event["message"]
        })

    async def chat_typing(self, event):
        # Don't send typing notification to the user who is typing
        if event["user_id"] != self.user.id:
            await self.send_json({
                "type": "typing",
                "chat_id": event["chat_id"],
                "user_id": event["user_id"],
                "username": event["username"],
                "is_typing": event["is_typing"]
            })

    async def chat_read(self, event):
        await self.send_json({
            "type": "read",
            "chat_id": event["chat_id"],
            "reader_id": event["reader_id"]
        })

    async def user_invite(self, event):
        # Received when a new chat is created by another user involving this user
        chat_id = event["chat_id"]
        
        # Auto-subscribe to the new chat group
        await self.channel_layer.group_add(
            f"chat_{chat_id}",
            self.channel_name
        )
        if chat_id not in self.chat_ids:
            self.chat_ids.append(chat_id)
            
        await self.send_json({
            "type": "invite",
            "chat": event["chat"]
        })

    # DB async methods
    @database_sync_to_async
    def get_user_chats(self):
        return list(self.user.chats.values_list('id', flat=True))

    @database_sync_to_async
    def set_online_status(self, is_online):
        Profile.objects.filter(user=self.user).update(is_online=is_online)

    @database_sync_to_async
    def save_message(self, chat_id, content):
        try:
            chat = Chat.objects.get(id=chat_id, members=self.user)
            message = Message.objects.create(chat=chat, sender=self.user, content=content)
            return {
                'id': message.id,
                'chat_id': chat.id,
                'sender_id': self.user.id,
                'sender_username': self.user.username,
                'sender_name': self.user.get_full_name() or self.user.username,
                'content': message.content,
                'timestamp': message.timestamp.isoformat(),
                'is_read': message.is_read
            }
        except Chat.DoesNotExist:
            return None

    @database_sync_to_async
    def mark_messages_read(self, chat_id):
        try:
            chat = Chat.objects.get(id=chat_id, members=self.user)
            Message.objects.filter(chat=chat, is_read=False).exclude(sender=self.user).update(is_read=True)
            return True
        except Chat.DoesNotExist:
            return False

    @database_sync_to_async
    def verify_chat_membership(self, chat_id):
        return Chat.objects.filter(id=chat_id, members=self.user).exists()
