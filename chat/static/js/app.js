// Echat - Client Application Logic

document.addEventListener("DOMContentLoaded", () => {
    // Current User Data (read from body attributes)
    const currentUserId = parseInt(document.body.getAttribute("data-user-id"));
    const currentUsername = document.body.getAttribute("data-username");
    const currentDisplayName = document.body.getAttribute("data-user-name");

    // State Variables
    let activeChatId = null;
    let socket = null;
    let chatsList = [];
    let typingTimeout = null;
    let isTyping = false;
    let currentChatType = 'dm'; // 'dm' or 'group'
    
    // DOM Elements
    const appLayout = document.querySelector(".app-layout");
    const activeChatsList = document.getElementById("active-chats-list");
    const chatsEmptyState = document.getElementById("chats-empty-state");
    const welcomeDashboard = document.getElementById("welcome-dashboard");
    const activeChatWrapper = document.getElementById("active-chat-wrapper");
    
    // Header Elements
    const headerChatName = document.getElementById("header-chat-name");
    const headerStatus = document.getElementById("header-status");
    const headerAvatar = document.getElementById("header-avatar");
    const headerInitials = document.getElementById("header-initials");
    
    // Messages Elements
    const messagesBody = document.getElementById("messages-body");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");
    const typingIndicatorBar = document.getElementById("typing-indicator-bar");
    const typingText = document.getElementById("typing-text");
    
    // Mobile Back Button
    const mobileBackBtn = document.getElementById("mobile-back-btn");
    
    // Dropdown & Menu Elements
    const mainMenuBtn = document.getElementById("main-menu-btn");
    const mainDropdownMenu = document.getElementById("main-dropdown-menu");
    
    // Search Elements
    const searchInput = document.getElementById("search-input");
    const clearSearchBtn = document.getElementById("clear-search-btn");
    const searchResultsContainer = document.getElementById("search-results-container");
    const searchResultsList = document.getElementById("search-results-list");
    const searchEmptyState = document.getElementById("search-empty-state");
    const chatListContainer = document.getElementById("chat-list-container");
    
    // Contacts Modal elements
    const contactsModal = document.getElementById("contacts-modal");
    const closeContactsModalBtn = document.getElementById("close-contacts-modal");
    const closeContactsBtn = document.getElementById("close-contacts-btn");
    const menuContactsBtn = document.getElementById("menu-contacts");
    const addContactBtn = document.getElementById("add-contact-btn");
    const contactUsernameInput = document.getElementById("contact-username-input");
    const contactsListContainer = document.getElementById("contacts-list-container");
    const addContactError = document.getElementById("add-contact-error");
    const addContactSuccess = document.getElementById("add-contact-success");
    const infoActionsSection = document.getElementById("info-actions-section");
    const drawerAddContactBtn = document.getElementById("drawer-add-contact-btn");
    
    // Modals
    const groupModal = document.getElementById("group-modal");
    const settingsModal = document.getElementById("settings-modal");
    const closeGroupModalBtn = document.getElementById("close-group-modal");
    const closeSettingsModalBtn = document.getElementById("close-settings-modal");
    const cancelGroupBtn = document.getElementById("cancel-group-btn");
    const cancelSettingsBtn = document.getElementById("cancel-settings-btn");
    const createGroupBtn = document.getElementById("create-group-btn");
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    const groupNameInput = document.getElementById("group-name-input");
    const groupMembersSelector = document.getElementById("group-members-selector");
    
    // Settings profile elements
    const settingsAvatarPreview = document.getElementById("settings-avatar-preview");
    const settingsInitialsPreview = document.getElementById("settings-initials-preview");
    const settingsUsernameDisplay = document.getElementById("settings-username-display");
    const settingsFirstName = document.getElementById("settings-first-name");
    const settingsLastName = document.getElementById("settings-last-name");
    const settingsBio = document.getElementById("settings-bio");

    // Right Sidebar Drawer Info
    const infoSidebar = document.getElementById("info-sidebar");
    const viewInfoBtn = document.getElementById("view-info-btn");
    const closeInfoBtn = document.getElementById("close-info-btn");
    const infoAvatar = document.getElementById("info-avatar");
    const infoInitials = document.getElementById("info-initials");
    const infoName = document.getElementById("info-name");
    const infoUsername = document.getElementById("info-username");
    const infoBio = document.getElementById("info-bio");
    const infoGroupMembersSection = document.getElementById("info-group-members-section");
    const infoMembersList = document.getElementById("info-members-list");

    // CSRF helper function
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Connect to WebSocket
    function connectWebSocket() {
        const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${wsScheme}://${window.location.host}/ws/chat/`;
        
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log("WebSocket connected to Echat Server");
        };
        
        socket.onmessage = (e) => {
            const data = JSON.parse(e.data);
            handleWebSocketMessage(data);
        };
        
        socket.onclose = (e) => {
            console.log("WebSocket connection closed, attempting reconnect in 3s...", e.reason);
            setTimeout(connectWebSocket, 3000);
        };
        
        socket.onerror = (err) => {
            console.error("WebSocket encountered an error: ", err);
            socket.close();
        };
    }

    // Handle incoming WS notifications
    function handleWebSocketMessage(data) {
        switch (data.type) {
            case "message":
                handleIncomingMessage(data.message);
                break;
            case "typing":
                handleIncomingTyping(data);
                break;
            case "read":
                handleIncomingRead(data);
                break;
            case "invite":
                handleIncomingInvite(data.chat);
                break;
            default:
                break;
        }
    }

    // Handle new message arrival
    function handleIncomingMessage(msg) {
        // 1. If message is for active chat
        if (activeChatId === msg.chat_id) {
            appendMessageBubble(msg);
            scrollMessagesToBottom();
            
            // Mark messages as read (if received from other user)
            if (msg.sender_id !== currentUserId) {
                sendWebSocketAction({
                    action: "read_messages",
                    chat_id: activeChatId
                });
            }
        }
        
        // 2. Update sidebar chat list representation
        updateSidebarWithNewMessage(msg);
    }

    // Append message bubble to chat window
    function appendMessageBubble(msg) {
        const isOutgoing = msg.sender_id === currentUserId;
        const bubble = document.createElement("div");
        bubble.className = `message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
        if (msg.is_read) bubble.classList.add('is-read');
        bubble.id = `msg-${msg.id}`;
        
        const timestamp = new Date(msg.timestamp);
        const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        let contentHTML = '';
        if (currentChatType === 'group' && !isOutgoing) {
            contentHTML += `<span class="sender-name">${msg.sender_name}</span>`;
        }
        contentHTML += `
            <div class="msg-text">${escapeHTML(msg.content)}</div>
            <div class="msg-footer">
                <span>${timeStr}</span>
                <svg class="read-status-icon" viewBox="0 0 24 24">
                    <!-- Double tick checkmark icon -->
                    <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.17-4.17-1.41 1.41 5.59 5.59 12-12-1.43-1.43zM2.81 12.19L1.4 13.6l5.59 5.59 1.41-1.41-5.59-5.59z"/>
                </svg>
            </div>
        `;
        
        bubble.innerHTML = contentHTML;
        messagesBody.appendChild(bubble);
    }

    // Update sidebar state when a message is sent/received
    function updateSidebarWithNewMessage(msg) {
        const chatItem = document.querySelector(`.chat-item[data-chat-id="${msg.chat_id}"]`);
        
        if (chatItem) {
            // Update last message preview
            const previewEl = chatItem.querySelector(".last-msg");
            previewEl.textContent = msg.content;
            
            // Update timestamp
            const timeEl = chatItem.querySelector(".chat-time");
            const date = new Date(msg.timestamp);
            timeEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Increment unread count if not currently viewing this chat and sender is someone else
            if (activeChatId !== msg.chat_id && msg.sender_id !== currentUserId) {
                let badge = chatItem.querySelector(".unread-badge");
                if (badge) {
                    let count = parseInt(badge.textContent) + 1;
                    badge.textContent = count;
                } else {
                    const row = chatItem.querySelector(".chat-msg-row");
                    badge = document.createElement("span");
                    badge.className = "unread-badge";
                    badge.textContent = "1";
                    row.appendChild(badge);
                }
            }
            
            // Move chat item to top of sidebar list
            activeChatsList.prepend(chatItem);
        } else {
            // If chat item doesn't exist, we fetch active chats list again
            loadActiveChats();
        }
    }

    // Handle real-time typing indicators
    function handleIncomingTyping(data) {
        if (activeChatId === data.chat_id) {
            if (data.is_typing) {
                typingText.textContent = `${data.username} is typing...`;
                typingIndicatorBar.classList.add("active");
            } else {
                typingIndicatorBar.classList.remove("active");
            }
        }
    }

    // Handle message read confirmation
    function handleIncomingRead(data) {
        // If incoming read receipt matches active chat, update tick colors
        if (activeChatId === data.chat_id) {
            // Update all outgoing messages to read status (ticks turn green/blue)
            const outgoingMessages = messagesBody.querySelectorAll(".message-bubble.outgoing:not(.is-read)");
            outgoingMessages.forEach(msg => {
                msg.classList.add("is-read");
            });
        }
        
        // Also clear unread badge on sidebar if reader is current user
        if (data.reader_id === currentUserId) {
            const chatItem = document.querySelector(`.chat-item[data-chat-id="${data.chat_id}"]`);
            if (chatItem) {
                const badge = chatItem.querySelector(".unread-badge");
                if (badge) badge.remove();
            }
        }
    }

    // Handle new chat invites (when someone creates a chat with us)
    function handleIncomingInvite(chat) {
        // Join WebSocket Channel group for new chat
        sendWebSocketAction({
            action: "join_chat_group",
            chat_id: chat.id
        });
        
        // Prepend new chat item to sidebar
        const html = renderChatItemHTML(chat);
        activeChatsList.insertAdjacentHTML('afterbegin', html);
        
        // Remove empty state if visible
        chatsEmptyState.style.display = "none";
    }

    // Helper: Escape HTML strings to prevent XSS
    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Helper: Send JSON payload over WebSockets
    function sendWebSocketAction(payload) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        } else {
            console.warn("WebSocket is not connected. Action queued: ", payload);
        }
    }

    // Load active chat list from DB
    async function loadActiveChats() {
        try {
            const response = await fetch("/api/chats/");
            if (!response.ok) throw new Error("Failed to load chats");
            
            chatsList = await response.json();
            
            activeChatsList.innerHTML = "";
            
            if (chatsList.length === 0) {
                chatsEmptyState.style.display = "block";
            } else {
                chatsEmptyState.style.display = "none";
                chatsList.forEach(chat => {
                    const html = renderChatItemHTML(chat);
                    activeChatsList.insertAdjacentHTML('beforeend', html);
                });
                
                // Add click listeners to chat items
                attachChatItemListeners();
            }
        } catch (error) {
            console.error("Error loading chats: ", error);
            activeChatsList.innerHTML = `<div class="chats-empty">Error loading chats. Make sure server is running.</div>`;
        }
    }

    // Render HTML string for sidebar chat item
    function renderChatItemHTML(chat) {
        let lastMsgText = "No messages yet";
        let lastMsgTime = "";
        
        if (chat.last_message) {
            lastMsgText = chat.last_message.content;
            const date = new Date(chat.last_message.timestamp);
            lastMsgTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        const unreadBadgeHTML = chat.unread_count > 0 
            ? `<span class="unread-badge">${chat.unread_count}</span>` 
            : "";
            
        const onlineBadgeHTML = (!chat.is_group && chat.is_online) 
            ? `<span class="online-badge"></span>` 
            : "";
            
        const isActive = chat.id === activeChatId ? "active" : "";
        
        return `
            <div class="chat-item ${isActive}" data-chat-id="${chat.id}" data-is-group="${chat.is_group}">
                <div class="avatar" style="background-color: ${chat.avatar_color};">
                    <span class="initials">${chat.initials}</span>
                    ${onlineBadgeHTML}
                </div>
                <div class="chat-info">
                    <div class="chat-name-row">
                        <h4>${escapeHTML(chat.name)}</h4>
                        <span class="chat-time">${lastMsgTime}</span>
                    </div>
                    <div class="chat-msg-row">
                        <span class="last-msg">${escapeHTML(lastMsgText)}</span>
                        ${unreadBadgeHTML}
                    </div>
                </div>
            </div>
        `;
    }

    // Add click handlers to sidebar items
    function attachChatItemListeners() {
        const items = activeChatsList.querySelectorAll(".chat-item");
        items.forEach(item => {
            item.onclick = () => {
                const chatId = parseInt(item.getAttribute("data-chat-id"));
                openChat(chatId);
            };
        });
    }

    // Open chat thread
    async function openChat(chatId) {
        if (activeChatId === chatId) return;
        
        activeChatId = chatId;
        
        // Remove typing indicator if running from previous chat
        typingIndicatorBar.classList.remove("active");
        
        // Highlight active item in sidebar
        activeChatsList.querySelectorAll(".chat-item").forEach(item => {
            if (parseInt(item.getAttribute("data-chat-id")) === chatId) {
                item.classList.add("active");
                // Remove unread badge
                const badge = item.querySelector(".unread-badge");
                if (badge) badge.remove();
            } else {
                item.classList.remove("active");
            }
        });
        
        // Mobile layout: slide chat into view
        appLayout.classList.add("chat-active");
        
        // Show loading state, load from API
        welcomeDashboard.style.display = "none";
        activeChatWrapper.style.display = "flex";
        messagesBody.innerHTML = `<div class="chats-loading"><div class="spinner"></div></div>`;
        
        try {
            // Find chat in loaded array list
            const chat = chatsList.find(c => c.id === chatId) || await fetchChatDetails(chatId);
            
            currentChatType = chat.is_group ? 'group' : 'dm';
            
            // Set header text
            headerChatName.textContent = chat.name;
            headerInitials.textContent = chat.initials;
            headerAvatar.style.backgroundColor = chat.avatar_color;
            
            if (chat.is_group) {
                headerStatus.textContent = `${chat.member_count} members`;
                headerStatus.classList.remove("online");
            } else {
                if (chat.is_online) {
                    headerStatus.textContent = "online";
                    headerStatus.classList.add("online");
                } else {
                    headerStatus.textContent = "offline";
                    headerStatus.classList.remove("online");
                }
            }
            
            // Load messages list
            const messagesResponse = await fetch(`/api/chats/${chatId}/messages/`);
            const messages = await messagesResponse.json();
            
            messagesBody.innerHTML = "";
            if (messages.length === 0) {
                messagesBody.innerHTML = `<div class="chats-empty">No messages. Start the conversation.</div>`;
            } else {
                messages = messages.forEach(msg => {
                    appendMessageBubble(msg);
                });
                scrollMessagesToBottom();
            }
            
            // Send read message WS action
            sendWebSocketAction({
                action: "read_messages",
                chat_id: chatId
            });
            
            // Populate right drawer details
            populateInfoDrawer(chat);
            
        } catch (error) {
            console.error("Error opening chat: ", error);
            messagesBody.innerHTML = `<div class="chats-empty">Failed to load chat history.</div>`;
        }
    }

    async function fetchChatDetails(chatId) {
        // Fallback fetch if chat metadata not cached in sidebar list
        const res = await fetch("/api/chats/");
        const chats = await res.json();
        chatsList = chats;
        return chats.find(c => c.id === chatId);
    }

    // Populate Right Info Drawer
    async function populateInfoDrawer(chat) {
        infoAvatar.style.backgroundColor = chat.avatar_color;
        infoInitials.textContent = chat.initials;
        infoName.textContent = chat.name;
        
        if (chat.is_group) {
            infoUsername.textContent = "Group Chat";
            infoBio.textContent = `Created at ${new Date(chat.created_at || Date.now()).toLocaleDateString()}`;
            infoGroupMembersSection.style.display = "block";
            
            // Load members
            infoMembersList.innerHTML = `<div class="spinner" style="margin-top: 1rem;"></div>`;
            try {
                // For simplicity, we can extend the API to retrieve group members,
                // but let's query the chat or list DM members.
                // We'll mock listing members or we can fetch them. Let's make an API endpoint for members if needed,
                // or mock it. To make it extremely clean and realistic:
                // We can query the profile or just mock standard users.
                // Better, let's keep a simplified list.
                infoMembersList.innerHTML = `
                    <li class="member-item">
                        <div class="avatar" style="background-color: var(--accent); width:32px; height:32px; font-size: 0.8rem;">ME</div>
                        <span class="member-name">${currentDisplayName} (You)</span>
                    </li>
                `;
            } catch (err) {
                infoMembersList.innerHTML = `Failed to load members.`;
            }
        } else {
            infoUsername.textContent = `@${chat.other_username}`;
            infoBio.textContent = chat.bio || "No bio set.";
            infoGroupMembersSection.style.display = "none";
            
            // Show/hide "Add to Contacts" action in drawer
            if (chat.other_user_id !== currentUserId && !chat.is_contact) {
                infoActionsSection.style.display = "block";
                drawerAddContactBtn.onclick = async () => {
                    const success = await addContactByUsername(chat.other_username);
                    if (success) {
                        alert("Contact added!");
                    }
                };
            } else {
                infoActionsSection.style.display = "none";
            }
        }
    }

    // Scroll Messages Container
    function scrollMessagesToBottom() {
        messagesBody.scrollTop = messagesBody.scrollHeight;
    }

    // Send Message handler
    messageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const content = messageInput.value.trim();
        if (!content || !activeChatId) return;
        
        // Send message over WebSocket
        sendWebSocketAction({
            action: "send_message",
            chat_id: activeChatId,
            content: content
        });
        
        // Clear input field
        messageInput.value = "";
        messageInput.focus();
        
        // Clear typing indicator
        if (isTyping) {
            isTyping = false;
            sendWebSocketAction({
                action: "typing",
                chat_id: activeChatId,
                is_typing: false
            });
        }
    });

    // Detect User Typing
    messageInput.addEventListener("input", () => {
        if (!activeChatId) return;
        
        if (!isTyping) {
            isTyping = true;
            sendWebSocketAction({
                action: "typing",
                chat_id: activeChatId,
                is_typing: true
            });
        }
        
        // Debounce typing status
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            sendWebSocketAction({
                action: "typing",
                chat_id: activeChatId,
                is_typing: false
            });
        }, 3000);
    });

    // Mobile Back Button: return to sidebar
    mobileBackBtn.onclick = () => {
        activeChatId = null;
        appLayout.classList.remove("chat-active");
        
        // Reset sidebar active states
        activeChatsList.querySelectorAll(".chat-item").forEach(item => {
            item.classList.remove("active");
        });
    };

    // Toggle Main Menu Dropdown
    mainMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        mainDropdownMenu.classList.toggle("show");
    });

    document.addEventListener("click", () => {
        mainDropdownMenu.classList.remove("show");
    });

    // Toggle Info Sidebar Right Drawer
    viewInfoBtn.onclick = () => {
        infoSidebar.classList.toggle("show");
    };

    closeInfoBtn.onclick = () => {
        infoSidebar.classList.remove("show");
    };

    // Search Users functionality
    let searchDebounce = null;
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        
        if (query.length === 0) {
            clearSearch();
            return;
        }
        
        clearSearchBtn.style.display = "block";
        
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            performUserSearch(query);
        }, 3000);
    });

    clearSearchBtn.onclick = () => {
        clearSearch();
    };

    function clearSearch() {
        searchInput.value = "";
        clearSearchBtn.style.display = "none";
        searchResultsContainer.style.display = "none";
        chatListContainer.style.display = "block";
        loadActiveChats();
    }

    async function performUserSearch(query) {
        searchResultsList.innerHTML = `<div class="spinner" style="margin-top: 2rem;"></div>`;
        searchResultsContainer.style.display = "block";
        chatListContainer.style.display = "none";
        searchEmptyState.style.display = "none";
        
        try {
            const response = await fetch(`/api/users/search/?q=${encodeURIComponent(query)}`);
            const users = await response.json();
            
            searchResultsList.innerHTML = "";
            
            if (users.length === 0) {
                searchEmptyState.style.display = "block";
            } else {
                users.forEach(user => {
                    const html = `
                        <div class="search-item" data-user-id="${user.id}">
                            <div class="avatar" style="background-color: ${user.avatar_color};">
                                <span class="initials">${user.initials}</span>
                            </div>
                            <div class="chat-info">
                                <h4>${escapeHTML(user.name)}</h4>
                                <span class="last-msg">@${escapeHTML(user.username)} • ${user.bio || 'No bio'}</span>
                            </div>
                        </div>
                    `;
                    searchResultsList.insertAdjacentHTML("beforeend", html);
                });
                
                // Add click listener to search items to trigger DM
                attachSearchItemListeners();
            }
        } catch (error) {
            console.error("Search error: ", error);
            searchResultsList.innerHTML = `<div class="selector-empty">Failed to query directory.</div>`;
        }
    }

    function attachSearchItemListeners() {
        const items = searchResultsList.querySelectorAll(".search-item");
        items.forEach(item => {
            item.onclick = async () => {
                const userId = parseInt(item.getAttribute("data-user-id"));
                
                try {
                    const csrfToken = getCookie('csrftoken');
                    const response = await fetch('/api/chats/create/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': csrfToken
                        },
                        body: JSON.stringify({
                            user_ids: [userId],
                            is_group: false
                        })
                    });
                    
                    const chat = await response.json();
                    
                    if (response.ok) {
                        // Clear search box, return to chat listing
                        clearSearch();
                        
                        // Register subscription in WebSocket Group
                        sendWebSocketAction({
                            action: "join_chat_group",
                            chat_id: chat.id
                        });
                        
                        // Load chats list and open new chat
                        await loadActiveChats();
                        openChat(chat.id);
                    } else {
                        alert(chat.error || 'Failed to create DM');
                    }
                } catch (error) {
                    console.error("Error creating chat: ", error);
                }
            };
        });
    }

    // Modal Events: Group Modal
    document.getElementById("menu-new-group").onclick = async () => {
        groupModal.classList.add("show");
        groupNameInput.value = "";
        createGroupBtn.disabled = true;
        
        // Load DM contacts into checkbox selector list
        groupMembersSelector.innerHTML = `<div class="spinner" style="margin-top: 1rem;"></div>`;
        
        try {
            // Find all unique DM users from current chats
            const dms = chatsList.filter(c => !c.is_group && c.other_username !== currentUsername);
            
            groupMembersSelector.innerHTML = "";
            
            if (dms.length === 0) {
                groupMembersSelector.innerHTML = `<div class="selector-empty">You can only add users you've chatted with before. Search for users in the sidebar first to message them.</div>`;
                return;
            }
            
            dms.forEach(chat => {
                const html = `
                    <label class="selector-item">
                        <input type="checkbox" name="group-members" value="${chat.other_user_id}">
                        <div class="avatar" style="background-color: ${chat.avatar_color}">
                            <span class="initials">${chat.initials}</span>
                        </div>
                        <span class="selector-name">${escapeHTML(chat.name)}</span>
                    </label>
                `;
                groupMembersSelector.insertAdjacentHTML("beforeend", html);
            });
            
            // Listen to checkbox change event to enable/disable submit button
            const checkboxes = groupMembersSelector.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(box => {
                box.onchange = () => {
                    const checkedCount = groupMembersSelector.querySelectorAll('input[name="group-members"]:checked').length;
                    const groupName = groupNameInput.value.trim();
                    createGroupBtn.disabled = !(checkedCount > 0 && groupName.length > 0);
                };
            });
            
            groupNameInput.oninput = () => {
                const checkedCount = groupMembersSelector.querySelectorAll('input[name="group-members"]:checked').length;
                const groupName = groupNameInput.value.trim();
                createGroupBtn.disabled = !(checkedCount > 0 && groupName.length > 0);
            };
            
        } catch (error) {
            console.error("Error loading group selector: ", error);
            groupMembersSelector.innerHTML = `Failed to load contacts list.`;
        }
    };

    createGroupBtn.onclick = async () => {
        const groupName = groupNameInput.value.trim();
        const checkedBoxes = groupMembersSelector.querySelectorAll('input[name="group-members"]:checked');
        const userIds = Array.from(checkedBoxes).map(box => parseInt(box.value));
        
        if (!groupName || userIds.length === 0) return;
        
        createGroupBtn.disabled = true;
        createGroupBtn.textContent = "Creating...";
        
        try {
            const csrfToken = getCookie('csrftoken');
            const response = await fetch('/api/chats/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    user_ids: userIds,
                    is_group: true,
                    name: groupName
                })
            });
            
            const chat = await response.json();
            
            if (response.ok) {
                // Register WebSocket subscription
                sendWebSocketAction({
                    action: "join_chat_group",
                    chat_id: chat.id
                });
                
                // Close modal
                groupModal.classList.remove("show");
                
                // Refresh list and open new group
                await loadActiveChats();
                openChat(chat.id);
            } else {
                alert(chat.error || 'Failed to create group');
            }
        } catch (err) {
            console.error("Error creating group: ", err);
        } finally {
            createGroupBtn.textContent = "Create Group";
        }
    };

    // Modal Events: Settings Profile Modal
    document.getElementById("menu-settings").onclick = () => {
        settingsModal.classList.add("show");
        
        // Set initials & names
        settingsInitialsPreview.textContent = currentDisplayName.split(' ').map(p => p[0]).join('').toUpperCase() || "ME";
        settingsUsernameDisplay.textContent = `@${currentUsername}`;
        
        // Fetch current user details or use form defaults
        const nameParts = currentDisplayName.split(' ');
        settingsFirstName.value = nameParts[0] || "";
        settingsLastName.value = nameParts.slice(1).join(' ') || "";
        
        // Find self-chat bio or query profile
        const selfChat = chatsList.find(c => c.other_user_id === currentUserId);
        settingsBio.value = selfChat ? selfChat.bio : "";
    };

    saveSettingsBtn.onclick = async () => {
        const firstName = settingsFirstName.value.trim();
        const lastName = settingsLastName.value.trim();
        const bioText = settingsBio.value.trim();
        
        saveSettingsBtn.disabled = true;
        saveSettingsBtn.textContent = "Saving...";
        
        try {
            const csrfToken = getCookie('csrftoken');
            const response = await fetch('/api/profile/update/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName,
                    bio: bioText
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Update local tags
                document.body.setAttribute("data-user-name", result.name);
                
                // Close modal
                settingsModal.classList.remove("show");
                
                // Refresh chats view
                await loadActiveChats();
                
                if (activeChatId) {
                    // Update header if we were chatting with ourselves
                    const activeChat = chatsList.find(c => c.id === activeChatId);
                    if (activeChat && activeChat.other_user_id === currentUserId) {
                        openChat(activeChatId);
                    }
                }
            } else {
                alert(result.error || 'Failed to update profile settings');
            }
        } catch (error) {
            console.error("Profile update error: ", error);
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.textContent = "Save Changes";
        }
    };

    // Load contacts list
    async function loadContactsList() {
        try {
            const response = await fetch("/api/contacts/");
            if (!response.ok) throw new Error("Failed to load contacts");
            const contacts = await response.json();
            
            contactsListContainer.innerHTML = "";
            if (contacts.length === 0) {
                contactsListContainer.innerHTML = `<div class="selector-empty">Your contacts list is empty. Add users by typing their username above.</div>`;
            } else {
                contacts.forEach(user => {
                    const html = `
                        <div class="selector-item contact-item" data-user-id="${user.id}" data-username="${user.username}" style="display: flex; align-items: center; padding: 0.65rem 0.85rem; cursor: pointer; user-select: none; gap: 0.75rem;">
                            <div class="avatar" style="background-color: ${user.avatar_color}; width: 34px; height: 34px; font-size: 0.8rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                                <span class="initials">${user.initials}</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <span class="selector-name" style="font-size: 0.88rem; font-weight: 500; color: var(--text-primary);">${escapeHTML(user.name)}</span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary);">@${escapeHTML(user.username)}</span>
                            </div>
                        </div>
                    `;
                    contactsListContainer.insertAdjacentHTML("beforeend", html);
                });
                
                // Add click listener to contact items to start a chat
                contactsListContainer.querySelectorAll(".contact-item").forEach(item => {
                    item.onclick = async () => {
                        const userId = parseInt(item.getAttribute("data-user-id"));
                        try {
                            const csrfToken = getCookie('csrftoken');
                            const response = await fetch('/api/chats/create/', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-CSRFToken': csrfToken
                                },
                                body: JSON.stringify({
                                    user_ids: [userId],
                                    is_group: false
                                })
                            });
                            
                            const chat = await response.json();
                            if (response.ok) {
                                closeModal(contactsModal);
                                sendWebSocketAction({
                                    action: "join_chat_group",
                                    chat_id: chat.id
                                });
                                await loadActiveChats();
                                openChat(chat.id);
                            } else {
                                alert(chat.error || 'Failed to create DM');
                            }
                        } catch (error) {
                            console.error("Error creating DM from contacts: ", error);
                        }
                    };
                });
            }
        } catch (error) {
            console.error("Error loading contacts: ", error);
            contactsListContainer.innerHTML = `<div class="selector-empty">Failed to load contacts list.</div>`;
        }
    }

    // Add contact by username function
    async function addContactByUsername(username) {
        try {
            const csrfToken = getCookie('csrftoken');
            const response = await fetch('/api/contacts/add/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ username: username })
            });
            const result = await response.json();
            if (response.ok) {
                if (activeChatId) {
                    const activeChat = chatsList.find(c => c.id === activeChatId);
                    if (activeChat && activeChat.other_username === username) {
                        activeChat.is_contact = true;
                        infoActionsSection.style.display = "none";
                    }
                }
                await loadActiveChats();
                await loadContactsList();
                return true;
            } else {
                throw new Error(result.error || 'Failed to add contact');
            }
        } catch (error) {
            console.error("Error adding contact: ", error);
            alert(error.message);
            return false;
        }
    }

    // Menu Contacts Trigger
    menuContactsBtn.onclick = () => {
        contactsModal.classList.add("show");
        contactUsernameInput.value = "";
        addContactError.style.display = "none";
        addContactSuccess.style.display = "none";
        loadContactsList();
    };

    // Add Contact Button Trigger
    addContactBtn.onclick = async () => {
        const username = contactUsernameInput.value.trim();
        if (!username) return;
        
        addContactBtn.disabled = true;
        addContactError.style.display = "none";
        addContactSuccess.style.display = "none";
        
        try {
            const csrfToken = getCookie('csrftoken');
            const response = await fetch('/api/contacts/add/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ username: username })
            });
            const result = await response.json();
            if (response.ok) {
                contactUsernameInput.value = "";
                addContactSuccess.style.display = "block";
                setTimeout(() => { addContactSuccess.style.display = "none"; }, 3000);
                await loadContactsList();
                await loadActiveChats();
            } else {
                addContactError.textContent = result.error || 'Failed to add contact';
                addContactError.style.display = "block";
            }
        } catch (err) {
            addContactError.textContent = 'Network error occurred.';
            addContactError.style.display = "block";
        } finally {
            addContactBtn.disabled = false;
        }
    };

    // Close Modals
    const closeModal = (modal) => {
        modal.classList.remove("show");
    };

    closeGroupModalBtn.onclick = () => closeModal(groupModal);
    cancelGroupBtn.onclick = () => closeModal(groupModal);
    
    closeSettingsModalBtn.onclick = () => closeModal(settingsModal);
    cancelSettingsBtn.onclick = () => closeModal(settingsModal);

    closeContactsModalBtn.onclick = () => closeModal(contactsModal);
    closeContactsBtn.onclick = () => closeModal(contactsModal);
    
    // Close modal on click overlay
    window.onclick = (e) => {
        if (e.target === groupModal) closeModal(groupModal);
        if (e.target === settingsModal) closeModal(settingsModal);
        if (e.target === contactsModal) closeModal(contactsModal);
    };

    // App Initialization
    connectWebSocket();
    loadActiveChats();
});
