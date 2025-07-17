from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
import sqlite3
import json
import os

app = Flask(__name__)
CORS(app)

# Database configuration
DATABASE = 'tasks.db'

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with tables"""
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'General',
            priority TEXT DEFAULT 'Medium',
            completed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            due_date TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def dict_factory(cursor, row):
    """Convert row to dictionary"""
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """Get all tasks with optional filtering"""
    try:
        conn = get_db()
        conn.row_factory = dict_factory
        
        # Get query parameters
        status = request.args.get('status')
        priority = request.args.get('priority')
        category = request.args.get('category')
        
        # Build query
        query = 'SELECT * FROM tasks WHERE 1=1'
        params = []
        
        if status == 'completed':
            query += ' AND completed = ?'
            params.append(True)
        elif status == 'pending':
            query += ' AND completed = ?'
            params.append(False)
            
        if priority:
            query += ' AND priority = ?'
            params.append(priority)
            
        if category:
            query += ' AND category = ?'
            params.append(category)
        
        query += ' ORDER BY created_at DESC'
        
        cursor = conn.execute(query, params)
        tasks = cursor.fetchall()
        conn.close()
        
        return jsonify({
            'success': True,
            'data': tasks,
            'count': len(tasks)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks', methods=['POST'])
def create_task():
    """Create a new task"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or not data.get('title'):
            return jsonify({
                'success': False,
                'error': 'Title is required'
            }), 400
        
        # Prepare task data
        title = data.get('title')
        description = data.get('description', '')
        category = data.get('category', 'General')
        priority = data.get('priority', 'Medium')
        due_date = data.get('due_date')
        
        # Validate priority
        if priority not in ['Low', 'Medium', 'High']:
            priority = 'Medium'
        
        # Insert into database
        conn = get_db()
        cursor = conn.execute('''
            INSERT INTO tasks (title, description, category, priority, due_date)
            VALUES (?, ?, ?, ?, ?)
        ''', (title, description, category, priority, due_date))
        
        task_id = cursor.lastrowid
        conn.commit()
        
        # Get the created task
        conn.row_factory = dict_factory
        cursor = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
        task = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'success': True,
            'data': task,
            'message': 'Task created successfully'
        }), 201
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    """Get a specific task"""
    try:
        conn = get_db()
        conn.row_factory = dict_factory
        cursor = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
        task = cursor.fetchone()
        conn.close()
        
        if not task:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': task
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Update a task"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Check if task exists
        conn = get_db()
        cursor = conn.execute('SELECT id FROM tasks WHERE id = ?', (task_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        # Build update query
        update_fields = []
        params = []
        
        if 'title' in data:
            update_fields.append('title = ?')
            params.append(data['title'])
        
        if 'description' in data:
            update_fields.append('description = ?')
            params.append(data['description'])
        
        if 'category' in data:
            update_fields.append('category = ?')
            params.append(data['category'])
        
        if 'priority' in data:
            if data['priority'] in ['Low', 'Medium', 'High']:
                update_fields.append('priority = ?')
                params.append(data['priority'])
        
        if 'completed' in data:
            update_fields.append('completed = ?')
            params.append(data['completed'])
        
        if 'due_date' in data:
            update_fields.append('due_date = ?')
            params.append(data['due_date'])
        
        if not update_fields:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400
        
        # Execute update
        query = f'UPDATE tasks SET {", ".join(update_fields)} WHERE id = ?'
        params.append(task_id)
        
        conn.execute(query, params)
        conn.commit()
        
        # Get updated task
        conn.row_factory = dict_factory
        cursor = conn.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
        task = cursor.fetchone()
        conn.close()
        
        return jsonify({
            'success': True,
            'data': task,
            'message': 'Task updated successfully'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    try:
        conn = get_db()
        cursor = conn.execute('SELECT id FROM tasks WHERE id = ?', (task_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        conn.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Task deleted successfully'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get all unique categories"""
    try:
        conn = get_db()
        cursor = conn.execute('SELECT DISTINCT category FROM tasks WHERE category IS NOT NULL')
        categories = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        return jsonify({
            'success': True,
            'data': categories
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get task statistics"""
    try:
        conn = get_db()
        
        # Total tasks
        cursor = conn.execute('SELECT COUNT(*) FROM tasks')
        total = cursor.fetchone()[0]
        
        # Completed tasks
        cursor = conn.execute('SELECT COUNT(*) FROM tasks WHERE completed = 1')
        completed = cursor.fetchone()[0]
        
        # Pending tasks
        pending = total - completed
        
        # Tasks by priority
        cursor = conn.execute('''
            SELECT priority, COUNT(*) as count 
            FROM tasks 
            GROUP BY priority
        ''')
        priority_stats = {row[0]: row[1] for row in cursor.fetchall()}
        
        # Tasks by category
        cursor = conn.execute('''
            SELECT category, COUNT(*) as count 
            FROM tasks 
            GROUP BY category
        ''')
        category_stats = {row[0]: row[1] for row in cursor.fetchall()}
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'total': total,
                'completed': completed,
                'pending': pending,
                'completion_rate': round((completed / total * 100) if total > 0 else 0, 2),
                'priority_stats': priority_stats,
                'category_stats': category_stats
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Run app
    app.run(debug=True, host='0.0.0.0', port=5000)