// Global variables
const API_BASE_URL = 'http://localhost:5000/api';
let currentEditingTask = null;
let pendingDeleteTask = null;
let allTasks = [];

// DOM elements
const tasksGrid = document.getElementById('tasksGrid');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const taskModal = document.getElementById('taskModal');
const confirmModal = document.getElementById('confirmModal');
const taskForm = document.getElementById('taskForm');
const statsPanel = document.getElementById('statsPanel');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadTasks();
    loadCategories();
    setupEventListeners();
});

// Event listeners
function setupEventListeners() {
    taskForm.addEventListener('submit', handleTaskSubmit);
    
    // Close modals when clicking outside
    taskModal.addEventListener('click', function(e) {
        if (e.target === taskModal) {
            closeTaskModal();
        }
    });
    
    confirmModal.addEventListener('click', function(e) {
        if (e.target === confirmModal) {
            closeConfirmModal();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeTaskModal();
            closeConfirmModal();
        }
    });
}

// API functions
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message, 'error');
        throw error;
    }
}

// Load tasks
async function loadTasks() {
    try {
        showLoading(true);
        const response = await apiRequest('/tasks');
        allTasks = response.data;
        renderTasks(allTasks);
    } catch (error) {
        console.error('Error loading tasks:', error);
    } finally {
        showLoading(false);
    }
}

// Load categories for filter
async function loadCategories() {
    try {
        const response = await apiRequest('/categories');
        const categoryFilter = document.getElementById('categoryFilter');
        
        // Clear existing options except "All"
        categoryFilter.innerHTML = '<option value="">All</option>';
        
        response.data.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Render tasks
function renderTasks(tasks) {
    if (tasks.length === 0) {
        tasksGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    tasksGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    
    tasksGrid.innerHTML = tasks.map(task => createTaskCard(task)).join('');
}

// Create task card HTML
function createTaskCard(task) {
    const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date';
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !task.completed;
    
    return `
        <div class="task-card ${task.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}">
            <div class="task-header">
                <h3 class="task-title">${escapeHtml(task.title)}</h3>
                <div class="task-priority priority-${task.priority.toLowerCase()}">
                    ${task.priority}
                </div>
            </div>
            
            <div class="task-description">
                ${task.description ? escapeHtml(task.description) : 'No description'}
            </div>
            
            <div class="task-meta">
                <span class="task-category">
                    <i class="fas fa-tag"></i> ${escapeHtml(task.category)}
                </span>
                <span class="task-due-date ${isOverdue ? 'overdue' : ''}">
                    <i class="fas fa-calendar"></i> ${dueDate}
                </span>
            </div>
            
            <div class="task-actions">
                <button class="btn btn-sm ${task.completed ? 'btn-secondary' : 'btn-success'}" 
                        onclick="toggleTaskComplete(${task.id}, ${!task.completed})">
                    <i class="fas fa-${task.completed ? 'undo' : 'check'}"></i>
                    ${task.completed ? 'Undo' : 'Complete'}
                </button>
                <button class="btn btn-sm btn-secondary" onclick="editTask(${task.id})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
}

// Task modal functions
function openTaskModal(task = null) {
    currentEditingTask = task;
    const modalTitle = document.getElementById('modalTitle');
    
    if (task) {
        modalTitle.textContent = 'Edit Task';
        populateTaskForm(task);
    } else {
        modalTitle.textContent = 'Add New Task';
        taskForm.reset();
    }
    
    taskModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    // Focus on title field
    setTimeout(() => {
        document.getElementById('taskTitle').focus();
    }, 100);
}

function closeTaskModal() {
    taskModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentEditingTask = null;
    taskForm.reset();
}

function populateTaskForm(task) {
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskCategory').value = task.category;
    document.getElementById('taskPriority').value = task.priority;
    
    if (task.due_date) {
        // Convert UTC to local datetime-local format
        const date = new Date(task.due_date);
        const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        document.getElementById('taskDueDate').value = localDate.toISOString().slice(0, 16);
    }
}

// Handle task form submission
async function handleTaskSubmit(e) {
    e.preventDefault();
    
    const formData = {
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim(),
        category: document.getElementById('taskCategory').value.trim() || 'General',
        priority: document.getElementById('taskPriority').value,
        due_date: document.getElementById('taskDueDate').value || null
    };
    
    if (!formData.title) {
        showToast('Please enter a task title', 'error');
        return;
    }
    
    try {
        if (currentEditingTask) {
            await apiRequest(`/tasks/${currentEditingTask.id}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
            showToast('Task updated successfully!', 'success');
        } else {
            await apiRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
            showToast('Task created successfully!', 'success');
        }
        
        closeTaskModal();
        loadTasks();
        loadCategories();
    } catch (error) {
        console.error('Error saving task:', error);
    }
}

// Edit task
function editTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (task) {
        openTaskModal(task);
    }
}

// Toggle task completion
async function toggleTaskComplete(taskId, completed) {
    try {
        await apiRequest(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ completed })
        });
        
        showToast(`Task ${completed ? 'completed' : 'reopened'}!`, 'success');
        loadTasks();
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

// Delete task
function deleteTask(taskId) {
    pendingDeleteTask = taskId;
    document.getElementById('confirmMessage').textContent = 
        'Are you sure you want to delete this task? This action cannot be undone.';
    confirmModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeConfirmModal() {
    confirmModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    pendingDeleteTask = null;
}

async function confirmAction() {
    if (pendingDeleteTask) {
        try {
            await apiRequest(`/tasks/${pendingDeleteTask}`, {
                method: 'DELETE'
            });
            showToast('Task deleted successfully!', 'success');
            loadTasks();
            loadCategories();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    }
    closeConfirmModal();
}

// Filters
function applyFilters() {
    const statusFilter = document.getElementById('statusFilter').value;
    const priorityFilter = document.getElementById('priorityFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    let filteredTasks = allTasks;
    
    if (statusFilter === 'completed') {
        filteredTasks = filteredTasks.filter(task => task.completed);
    } else if (statusFilter === 'pending') {
        filteredTasks = filteredTasks.filter(task => !task.completed);
    }
    
    if (priorityFilter) {
        filteredTasks = filteredTasks.filter(task => task.priority === priorityFilter);
    }
    
    if (categoryFilter) {
        filteredTasks = filteredTasks.filter(task => task.category === categoryFilter);
    }
    
    renderTasks(filteredTasks);
}

// Statistics
async function toggleStats() {
    const panel = document.getElementById('statsPanel');
    
    if (panel.style.display === 'none') {
        await loadStats();
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

async function loadStats() {
    try {
        const response = await apiRequest('/stats');
        const stats = response.data;
        
        document.getElementById('totalTasks').textContent = stats.total;
        document.getElementById('completedTasks').textContent = stats.completed;
        document.getElementById('pendingTasks').textContent = stats.pending;
        document.getElementById('completionRate').textContent = stats.completion_rate + '%';
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Utility functions
function showLoading(show) {
    loading.style.display = show ? 'block' : 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.getElementById('toastContainer').appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

// Add some keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + N for new task
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openTaskModal();
    }
    
    // Ctrl/Cmd + R for refresh
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        loadTasks();
    }
});