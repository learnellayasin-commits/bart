from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
import random

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar = models.FileField(upload_to='avatars/', null=True, blank=True)
    avatar_color = models.CharField(max_length=7, default='#3b82f6') # hex color
    bio = models.TextField(max_length=500, blank=True)
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s profile"

    @property
    def initials(self):
        name = self.user.get_full_name() or self.user.username
        parts = name.split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[1][0]).upper()
        return name[:2].upper()

class Chat(models.Model):
    is_group = models.BooleanField(default=False)
    name = models.CharField(max_length=255, blank=True, null=True) # group name
    members = models.ManyToManyField(User, related_name='chats')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.is_group:
            return f"Group: {self.name}"
        return f"DM: {', '.join([u.username for u in self.members.all()])}"

    def get_other_member(self, user):
        if not self.is_group:
            return self.members.exclude(id=user.id).first()
        return None

class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ['timestamp', 'id']

    def __str__(self):
        return f"Message by {self.sender.username} in Chat {self.chat.id} at {self.timestamp}"


class Contact(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='contacts')
    friend = models.ForeignKey(User, on_delete=models.CASCADE, related_name='friend_of')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'friend')
        ordering = ['friend__username']

    def __str__(self):
        return f"{self.user.username} contacts {self.friend.username}"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        colors = [
            '#e57373', '#f06292', '#ba68c8', '#9575cd', 
            '#7986cb', '#64b5f6', '#4fc3f7', '#4dd0e1', 
            '#4db6ac', '#81c784', '#aed581', '#ffb74d', 
            '#ff8a65'
        ]
        avatar_color = random.choice(colors)
        Profile.objects.create(user=instance, avatar_color=avatar_color)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()
    else:
        colors = [
            '#e57373', '#f06292', '#ba68c8', '#9575cd', 
            '#7986cb', '#64b5f6', '#4fc3f7', '#4dd0e1', 
            '#4db6ac', '#81c784', '#aed581', '#ffb74d', 
            '#ff8a65'
        ]
        avatar_color = random.choice(colors)
        Profile.objects.create(user=instance, avatar_color=avatar_color)
