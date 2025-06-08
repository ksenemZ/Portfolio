document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
        if (!sidebar.classList.contains('-translate-x-full')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    let startX = 0;
    let endX = 0;

    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    });

    document.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;

        if (endX - startX > 100) {
            sidebar.classList.remove('-translate-x-full');
        } else if (startX - endX > 100) {
            sidebar.classList.add('-translate-x-full');
        }
    });
});

document.getElementById('userSearchInput').addEventListener('input', function () {
    const query = this.value.toLowerCase();
    const userCards = document.querySelectorAll('.user-card');

    userCards.forEach(card => {
        const nameInput = card.querySelector('input[name="name"]');
        const bioInput = card.querySelector('input[name="bio"]');

        const name = nameInput?.value.toLowerCase() || '';
        const bio = bioInput?.value.toLowerCase() || '';

        if (name.includes(query) || bio.includes(query)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
});

document.getElementById('projectSearchInput').addEventListener('input', function () {
    const query = this.value.toLowerCase();
    const projectCards = document.querySelectorAll('.project-card');

    projectCards.forEach(card => {
        const titleInput = card.querySelector('input[name="title"]');
        const descriptionInput = card.querySelector('input[name="description"]');

        const title = titleInput?.value.toLowerCase();
        const description = descriptionInput?.value.toLowerCase();

        if (title.includes(query) || description.includes(query)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
});

function switchTab(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById('tab-' + tabId).classList.remove('hidden');
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('bg-gray-200'));

    if (event) event.target.classList.add('bg-gray-200');

    localStorage.setItem('adminTab', tabId);
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const created = urlParams.get('created') === 'true';

    const tabToShow = created ? 'users' : (localStorage.getItem('adminTab') || 'stats');
    switchTab(tabToShow);

    if (created) {
        setTimeout(() => {
            const msg = document.getElementById('successMessage');
            if (msg) msg.style.display = 'none';

            urlParams.delete('created');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            window.history.replaceState({}, document.title, newUrl);
        }, 5000);
    }
});

function openUserModal() {
    document.getElementById('userModal').classList.remove('hidden');
    document.getElementById('userModal').classList.add('flex');
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('flex');
    document.getElementById('userModal').classList.add('hidden');
}

const filterForm = document.querySelector('form[action="/admin"]');
const inputs = filterForm.querySelectorAll('select, input');

inputs.forEach(input => {
    input.addEventListener('change', () => {
        filterForm.submit();
    });
});

const chatMessages = document.getElementById('chat-messages');
chatMessages.scrollTop = chatMessages.scrollHeight;

document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const csrfToken = chatForm.querySelector('input[name="_csrf"]').value;

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        const response = await fetch('/admin/chat/send-ajax', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            body: JSON.stringify({ text })
        });

        if (response.ok) {
            chatInput.value = '';
            await fetchMessages();
        }
    });

    async function fetchMessages() {
        try {
            const res = await fetch('/admin/chat/messages');
            const messages = await res.json();
            renderMessages(messages);
        } catch (e) {
            console.error('Ошибка при загрузке чата:', e);
        }
    }

    function renderMessages(messages) {
        const currentUserId = parseInt(chatMessages.dataset.currentUser);
        chatMessages.innerHTML = messages.map(message => `
            <div class="flex ${message.user_id === currentUserId ? 'justify-end' : 'justify-start'}">
                <div class="max-w-[70%] mb-3 p-3 rounded-lg shadow-md relative ${message.user_id === currentUserId ? 'bg-blue-100' : 'bg-gray-100'}">
                    <div class="flex items-center justify-between mb-1 gap-3">
                        <div class="flex items-center gap-2">
                            <img src="${message.avatar || '/uploads/default-avatar-hq.png'}" class="w-6 h-6 rounded-full">
                            <span class="font-semibold text-sm">${message.username}</span>
                        </div>
                        ${message.user_id === currentUserId ? `
                            <div class="flex gap-2 text-xs text-blue-500">
                                <button type="button" onclick="openEditModal(${message.id}, \`${message.text.replace(/`/g, '\\`')}\`)">✏️</button>
                                <form action="/admin/chat/delete/${message.id}" method="POST" onsubmit="return confirm('Удалить сообщение?')">
                                    <input type="hidden" name="_csrf" value="${csrfToken}">
                                    <button type="submit">🗑️</button>
                                </form>
                            </div>` : ''
                        }
                    </div>
                    <p class="text-sm">${message.text}${message.edited ? '<span class="text-xs text-gray-500 ml-2">(изменено)</span>' : ''}</p>
                    <p class="text-xs text-gray-500 mt-1 text-right">${new Date(message.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</p>
                </div>
            </div>
        `).join('');

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    setInterval(fetchMessages, 2000);
    fetchMessages();
});

const chatContainer = document.getElementById("chat-container");

let autoScroll = true;

// Проверка, прокручен ли чат вниз
function isAtBottom() {
    return chatContainer.scrollTop + chatContainer.clientHeight >= chatContainer.scrollHeight - 10;
}

// Обработка ручной прокрутки
chatContainer.addEventListener("scroll", () => {
    autoScroll = isAtBottom();
});

function openEditModal(messageId, messageText) {
    const form = document.getElementById('edit-form');
    form.action = `/admin/chat/edit/${messageId}`;
    form.text.value = messageText;
    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

function toggleEditForm(button) {
    const container = button.closest('.task-text-area');
    const textEl = container.querySelector('.task-text');
    const formEl = container.querySelector('.task-edit-form');
    const editBtn = container.querySelector('.edit-btn');
    const input = formEl.querySelector('input[name="text"]');

    const isEditing = !formEl.classList.contains('hidden');

    if (isEditing) {
        formEl.classList.add('hidden');
        textEl.classList.remove('hidden');
        editBtn.classList.remove('hidden');
    } else {
        formEl.classList.remove('hidden');
        textEl.classList.add('hidden');
        editBtn.classList.add('hidden');
        input.focus();

        input.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                formEl.classList.add('hidden');
                textEl.classList.remove('hidden');
                editBtn.classList.remove('hidden');
                input.removeEventListener('keydown', escHandler);
            }
        });
    }
}

function validateEditForm(form) {
    const input = form.querySelector('input[name="text"]');
    const value = input.value.trim();

    if (value === '') {
        alert('Текст задачи не может быть пустым.');
        input.focus();
        return false;
    }

    return true;
}

function toggleDropdown(button) {
    const dropdown = button.nextElementSibling;
    dropdown.classList.toggle('hidden');

    document.addEventListener('click', function handler(e) {
        if (!button.parentNode.contains(e.target)) {
            dropdown.classList.add('hidden');
            document.removeEventListener('click', handler);
        }
    });
}

function toggleTasks(adminId) {
    const el = document.getElementById(`tasks-for-${adminId}`);
    if (el) {
        el.classList.toggle('hidden');
    }
}