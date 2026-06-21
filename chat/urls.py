from django.urls import path
from . import views

urlpatterns = [
    # Page views
    path('', views.index, name='index'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    
    # REST API endpoints
    path('api/chats/', views.api_chats, name='api_chats'),
    path('api/chats/<int:chat_id>/messages/', views.api_messages, name='api_messages'),
    path('api/users/search/', views.api_users_search, name='api_users_search'),
    path('api/chats/create/', views.api_create_chat, name='api_create_chat'),
    path('api/profile/update/', views.api_update_profile, name='api_update_profile'),
    path('api/contacts/', views.api_contacts, name='api_contacts'),
    path('api/contacts/add/', views.api_add_contact, name='api_add_contact'),
]
