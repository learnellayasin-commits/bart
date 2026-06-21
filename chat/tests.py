from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from .models import Chat, Message, Profile
import json

class EchatBackendTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user1 = User.objects.create_user(username='alice', password='password123', first_name='Alice', last_name='Smith')
        self.user2 = User.objects.create_user(username='bob', password='password123', first_name='Bob', last_name='Jones')
        
    def test_profile_creation_signal(self):
        """Test that user registration automatically triggers profile creation with color."""
        self.assertTrue(hasattr(self.user1, 'profile'))
        self.assertIsNotNone(self.user1.profile.avatar_color)
        self.assertEqual(self.user1.profile.initials, 'AS')
        
        self.assertTrue(hasattr(self.user2, 'profile'))
        self.assertEqual(self.user2.profile.initials, 'BJ')

    def test_login_and_logout(self):
        """Test authentication login/logout views."""
        # Test login page render
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)
        
        # Test post login success
        response = self.client.post(reverse('login'), data={
            'username': 'alice',
            'password': 'password123'
        })
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn('success', data)
        
        # Test dashboard login check
        response = self.client.get(reverse('index'))
        self.assertEqual(response.status_code, 200)

        # Test logout redirect
        response = self.client.get(reverse('logout'))
        self.assertEqual(response.status_code, 302) # redirects to login

    def test_chat_creation_and_duplication(self):
        """Test DM chat creation and verify duplicate DMs resolve to the same instance."""
        self.client.login(username='alice', password='password123')
        
        # Create a DM chat
        create_url = reverse('api_create_chat')
        response = self.client.post(create_url, data=json.dumps({
            'user_ids': [self.user2.id],
            'is_group': False
        }), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        chat1_data = json.loads(response.content)
        self.assertEqual(chat1_data['is_group'], False)
        self.assertEqual(chat1_data['name'], 'Bob Jones')
        
        # Attempt to create DM with Bob again (should return the same chat id)
        response2 = self.client.post(create_url, data=json.dumps({
            'user_ids': [self.user2.id],
            'is_group': False
        }), content_type='application/json')
        
        self.assertEqual(response2.status_code, 200)
        chat2_data = json.loads(response2.content)
        self.assertEqual(chat1_data['id'], chat2_data['id'])

    def test_group_chat_creation(self):
        """Test group chat creation with multiple members."""
        self.client.login(username='alice', password='password123')
        
        create_url = reverse('api_create_chat')
        response = self.client.post(create_url, data=json.dumps({
            'user_ids': [self.user2.id],
            'is_group': True,
            'name': 'Echat Developers'
        }), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        group_data = json.loads(response.content)
        self.assertEqual(group_data['is_group'], True)
        self.assertEqual(group_data['name'], 'Echat Developers')
        self.assertEqual(group_data['member_count'], 2)

    def test_chat_and_message_retrievals(self):
        """Test listing chats and retrieving message history."""
        self.client.login(username='alice', password='password123')
        
        # Setup: Create DM chat
        chat = Chat.objects.create(is_group=False)
        chat.members.add(self.user1, self.user2)
        chat.save()
        
        # Setup: Create messages
        msg1 = Message.objects.create(chat=chat, sender=self.user1, content="Hello Bob!")
        msg2 = Message.objects.create(chat=chat, sender=self.user2, content="Hi Alice! What's up?")
        
        # Fetch chats list API
        chats_url = reverse('api_chats')
        response = self.client.get(chats_url)
        self.assertEqual(response.status_code, 200)
        chats = json.loads(response.content)
        self.assertEqual(len(chats), 1)
        self.assertEqual(chats[0]['last_message']['content'], "Hi Alice! What's up?")
        
        # Fetch message history API
        messages_url = reverse('api_messages', kwargs={'chat_id': chat.id})
        response = self.client.get(messages_url)
        self.assertEqual(response.status_code, 200)
        messages = json.loads(response.content)
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]['content'], "Hello Bob!")
        self.assertEqual(messages[1]['content'], "Hi Alice! What's up?")

    def test_contacts_system(self):
        """Test adding contacts and retrieving contacts list."""
        self.client.login(username='alice', password='password123')
        
        # Verify contact list is initially empty
        contacts_url = reverse('api_contacts')
        response = self.client.get(contacts_url)
        self.assertEqual(response.status_code, 200)
        contacts = json.loads(response.content)
        self.assertEqual(len(contacts), 0)
        
        # Add Bob as a contact
        add_url = reverse('api_add_contact')
        response = self.client.post(add_url, data=json.dumps({
            'username': 'bob'
        }), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn('success', data)
        self.assertEqual(data['contact']['username'], 'bob')
        
        # Verify Bob is now in contacts list
        response = self.client.get(contacts_url)
        self.assertEqual(response.status_code, 200)
        contacts = json.loads(response.content)
        self.assertEqual(len(contacts), 1)
        self.assertEqual(contacts[0]['username'], 'bob')
        
        # Verify Alice cannot add herself
        response = self.client.post(add_url, data=json.dumps({
            'username': 'alice'
        }), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        
        # Verify Alice cannot add non-existent user
        response = self.client.post(add_url, data=json.dumps({
            'username': 'charlie'
        }), content_type='application/json')
        self.assertEqual(response.status_code, 404)
        
        # Verify Alice cannot add Bob twice
        response = self.client.post(add_url, data=json.dumps({
            'username': 'bob'
        }), content_type='application/json')
        self.assertEqual(response.status_code, 400)

