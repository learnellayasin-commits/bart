from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.db.models import Max, Q, Count
import json
from .models import Chat, Message, Profile, Contact
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

def serialize_chat(chat, user):
    lm = chat.messages.last()
    last_message = None
    if lm:
        last_message = {
            'id': lm.id,
            'content': lm.content,
            'timestamp': lm.timestamp.isoformat(),
            'sender_id': lm.sender.id,
            'sender_username': lm.sender.username,
            'sender_name': lm.sender.get_full_name() or lm.sender.username,
            'is_read': lm.is_read
        }

    unread_count = chat.messages.filter(is_read=False).exclude(sender=user).count()

    if chat.is_group:
        name = chat.name or f"Group {chat.id}"
        parts = name.split()
        initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else '')).upper() if parts else "GP"
        colors = [
            '#e57373', '#f06292', '#ba68c8', '#9575cd', 
            '#7986cb', '#64b5f6', '#4fc3f7', '#4dd0e1', 
            '#4db6ac', '#81c784', '#aed581', '#ffb74d', 
            '#ff8a65'
        ]
        color_idx = chat.id % len(colors)
        avatar_color = colors[color_idx]
        
        return {
            'id': chat.id,
            'is_group': True,
            'name': name,
            'avatar_color': avatar_color,
            'initials': initials,
            'last_message': last_message,
            'unread_count': unread_count,
            'member_count': chat.members.count()
        }
    else:
        other_user = chat.get_other_member(user)
        is_self = False
        if not other_user:
            # Chatting with oneself (Telegram's "Saved Messages" feature)
            other_user = user
            is_self = True
            
        profile = other_user.profile
        name = other_user.get_full_name() or other_user.username
        if is_self:
            name = "Saved Messages"
            
        return {
            'id': chat.id,
            'is_group': False,
            'name': name,
            'avatar_color': profile.avatar_color if not is_self else '#3b82f6',
            'initials': "★" if is_self else profile.initials,
            'other_user_id': other_user.id,
            'other_username': other_user.username,
            'is_online': profile.is_online if not is_self else True,
            'last_seen': profile.last_seen.isoformat() if not is_self else None,
            'bio': profile.bio,
            'last_message': last_message,
            'unread_count': unread_count,
            'is_contact': Contact.objects.filter(user=user, friend=other_user).exists() if not is_self else False
        }

@ensure_csrf_cookie
def register_view(request):
    if request.user.is_authenticated:
        return redirect('index')
    
    if request.method == 'POST':
        try:
            data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
            username = data.get('username')
            password = data.get('password')
            first_name = data.get('first_name', '')
            last_name = data.get('last_name', '')
            
            if not username or not password:
                return JsonResponse({'error': 'Username and password are required'}, status=400)
                
            if User.objects.filter(username=username).exists():
                return JsonResponse({'error': 'Username already exists'}, status=400)
                
            user = User.objects.create_user(
                username=username, 
                password=password,
                first_name=first_name,
                last_name=last_name
            )
            
            user = authenticate(username=username, password=password)
            if user:
                login(request, user)
                return JsonResponse({'success': 'User registered and logged in successfully'})
                
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
            
        return JsonResponse({'error': 'Invalid request method'}, status=400)
        
    return render(request, 'chat/register.html')

@ensure_csrf_cookie
def login_view(request):
    if request.user.is_authenticated:
        return redirect('index')
        
    if request.method == 'POST':
        try:
            data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
            username = data.get('username')
            password = data.get('password')
            
            if not username or not password:
                return JsonResponse({'error': 'Username and password are required'}, status=400)
                
            user = authenticate(username=username, password=password)
            if user:
                login(request, user)
                return JsonResponse({'success': 'Logged in successfully'})
            else:
                return JsonResponse({'error': 'Invalid username or password'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
            
    return render(request, 'chat/login.html')

def logout_view(request):
    logout(request)
    return redirect('login')

@login_required
@ensure_csrf_cookie
def index(request):
    return render(request, 'chat/index.html')

# API Endpoints
@login_required
def api_chats(request):
    # Get all chats the user is member of
    user_chats = request.user.chats.all().annotate(
        last_msg_time=Max('messages__timestamp')
    ).order_by('-last_msg_time', '-created_at')
    
    chats_data = [serialize_chat(chat, request.user) for chat in user_chats]
    return JsonResponse(chats_data, safe=False)

@login_required
def api_messages(request, chat_id):
    try:
        chat = Chat.objects.get(id=chat_id, members=request.user)
        messages = chat.messages.all().select_related('sender')
        
        messages_data = [{
            'id': msg.id,
            'sender_id': msg.sender.id,
            'sender_username': msg.sender.username,
            'sender_name': msg.sender.get_full_name() or msg.sender.username,
            'content': msg.content,
            'timestamp': msg.timestamp.isoformat(),
            'is_read': msg.is_read
        } for msg in messages]
        
        return JsonResponse(messages_data, safe=False)
    except Chat.DoesNotExist:
        return JsonResponse({'error': 'Chat not found or access denied'}, status=404)

@login_required
def api_users_search(request):
    query = request.GET.get('q', '').strip()
    if not query:
        return JsonResponse([], safe=False)
        
    # Search for users by username or first/last name, excluding current user
    users = User.objects.filter(
        Q(username__icontains=query) |
        Q(first_name__icontains=query) |
        Q(last_name__icontains=query)
    ).exclude(id=request.user.id)[:20]
    
    contact_ids = set(request.user.contacts.values_list('friend_id', flat=True))
    users_data = [{
        'id': u.id,
        'username': u.username,
        'name': u.get_full_name() or u.username,
        'avatar_color': u.profile.avatar_color,
        'initials': u.profile.initials,
        'bio': u.profile.bio,
        'is_online': u.profile.is_online,
        'is_contact': u.id in contact_ids
    } for u in users]
    
    return JsonResponse(users_data, safe=False)

@login_required
@require_http_methods(["POST"])
def api_create_chat(request):
    try:
        data = json.loads(request.body)
        user_ids = data.get('user_ids', [])
        is_group = data.get('is_group', False)
        group_name = data.get('name', '').strip()
        
        if not user_ids:
            return JsonResponse({'error': 'At least one participant is required'}, status=400)
            
        # Get users from database
        participants = list(User.objects.filter(id__in=user_ids))
        if len(participants) != len(user_ids):
            return JsonResponse({'error': 'One or more invalid user IDs'}, status=400)
            
        # For DMs, check if a DM already exists
        if not is_group and len(participants) == 1:
            target_user = participants[0]
            # Check if DM exists between user and target_user
            existing_chat = Chat.objects.filter(is_group=False).filter(members=request.user).filter(members=target_user).first()
            if existing_chat:
                return JsonResponse(serialize_chat(existing_chat, request.user))
                
            # Self DMs (Saved Messages)
            if target_user.id == request.user.id:
                existing_self_chat = Chat.objects.filter(is_group=False).annotate(num_members=Count('members')).filter(num_members=1, members=request.user).first()
                if existing_self_chat:
                    return JsonResponse(serialize_chat(existing_self_chat, request.user))
        
        # Create Chat
        chat = Chat.objects.create(is_group=is_group, name=group_name if is_group else '')
        
        # Add members
        chat.members.add(request.user)
        for p in participants:
            chat.members.add(p)
            
        chat.save()
        
        # Serialize chat for response and broadcast
        serialized_chat_sender = serialize_chat(chat, request.user)
        
        # Broadcast invite/creation event to other members
        channel_layer = get_channel_layer()
        for member in chat.members.all():
            if member.id != request.user.id:
                serialized_chat_recipient = serialize_chat(chat, member)
                async_to_sync(channel_layer.group_send)(
                    f"user_{member.id}",
                    {
                        "type": "user_invite",
                        "chat_id": chat.id,
                        "chat": serialized_chat_recipient
                    }
                )
                
        return JsonResponse(serialized_chat_sender)
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
@require_http_methods(["POST"])
def api_update_profile(request):
    try:
        data = json.loads(request.body)
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        bio = data.get('bio', '').strip()
        
        user = request.user
        if first_name is not None:
            user.first_name = first_name
        if last_name is not None:
            user.last_name = last_name
        user.save()
        
        profile = user.profile
        if bio is not None:
            profile.bio = bio
        profile.save()
        
        return JsonResponse({
            'success': 'Profile updated successfully',
            'username': user.username,
            'name': user.get_full_name() or user.username,
            'bio': profile.bio
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def api_contacts(request):
    contacts = request.user.contacts.all().select_related('friend', 'friend__profile')
    contacts_data = [{
        'id': c.friend.id,
        'username': c.friend.username,
        'name': c.friend.get_full_name() or c.friend.username,
        'avatar_color': c.friend.profile.avatar_color,
        'initials': c.friend.profile.initials,
        'bio': c.friend.profile.bio,
        'is_online': c.friend.profile.is_online
    } for c in contacts]
    return JsonResponse(contacts_data, safe=False)


@login_required
@require_http_methods(["POST"])
def api_add_contact(request):
    try:
        data = json.loads(request.body)
        username = data.get('username', '').strip()
        
        if not username:
            return JsonResponse({'error': 'Username is required'}, status=400)
            
        try:
            target_user = User.objects.get(username=username)
        except User.DoesNotExist:
            return JsonResponse({'error': f'User with username "{username}" not found'}, status=404)
            
        if target_user == request.user:
            return JsonResponse({'error': 'You cannot add yourself to contacts'}, status=400)
            
        if Contact.objects.filter(user=request.user, friend=target_user).exists():
            return JsonResponse({'error': f'"{username}" is already in your contacts'}, status=400)
            
        contact = Contact.objects.create(user=request.user, friend=target_user)
        
        return JsonResponse({
            'success': 'Contact added successfully',
            'contact': {
                'id': target_user.id,
                'username': target_user.username,
                'name': target_user.get_full_name() or target_user.username,
                'avatar_color': target_user.profile.avatar_color,
                'initials': target_user.profile.initials,
                'bio': target_user.profile.bio,
                'is_online': target_user.profile.is_online
            }
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

