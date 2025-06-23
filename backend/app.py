from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import csv
import io
import secrets
import string
from datetime import datetime, timedelta
import json

app = Flask(__name__)
CORS(app)

def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn

def generate_plan_code():
    """Generate a unique 8-character alphanumeric code"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

def cleanup_expired_plans():
    """Remove plans older than 1 year"""
    conn = get_db_connection()
    cutoff_date = datetime.now() - timedelta(days=365)
    conn.execute('DELETE FROM TransferPlan WHERE created_at < ?', (cutoff_date,))
    conn.commit()
    conn.close()

def init_db():
    """Initialize the database with required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create existing tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Institution (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Department (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            institution_id INTEGER NOT NULL,
            FOREIGN KEY (institution_id) REFERENCES Institution (id),
            UNIQUE(name, institution_id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Course (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            title TEXT NOT NULL,
            department_id INTEGER NOT NULL,
            institution_id INTEGER NOT NULL,
            FOREIGN KEY (department_id) REFERENCES Department (id),
            FOREIGN KEY (institution_id) REFERENCES Institution (id),
            UNIQUE(code, department_id, institution_id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS CourseEquivalency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_course_id INTEGER NOT NULL,
            target_course_id INTEGER NOT NULL,
            FOREIGN KEY (source_course_id) REFERENCES Course (id),
            FOREIGN KEY (target_course_id) REFERENCES Course (id),
            UNIQUE(source_course_id, target_course_id)
        )
    ''')
    
    # Create new plan table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS TransferPlan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            plan_name TEXT NOT NULL,
            source_institution_id INTEGER NOT NULL,
            target_institution_id INTEGER NOT NULL,
            selected_courses TEXT NOT NULL,
            plan_data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_institution_id) REFERENCES Institution (id),
            FOREIGN KEY (target_institution_id) REFERENCES Institution (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_db()

@app.route('/api/institutions')
def get_institutions():
    cleanup_expired_plans()  # Clean up old plans on each request
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM Institution ORDER BY name').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/departments')
def get_departments():
    institution_id = request.args.get('institution_id')
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM Department WHERE institution_id = ? ORDER BY name', (institution_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/courses')
def get_courses():
    department_id = request.args.get('department_id')
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM Course WHERE department_id = ? ORDER BY code', (department_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/equivalents')
def get_equivalents():
    course_id = request.args.get('course_id')
    conn = get_db_connection()
    rows = conn.execute('''
        SELECT c.*, i.name as institution_name, d.name as department_name FROM CourseEquivalency e
        JOIN Course c ON c.id = e.target_course_id
        JOIN Institution i ON i.id = c.institution_id
        JOIN Department d ON d.id = c.department_id
        WHERE e.source_course_id = ?
        UNION
        SELECT c.*, i.name as institution_name, d.name as department_name FROM CourseEquivalency e
        JOIN Course c ON c.id = e.source_course_id
        JOIN Institution i ON i.id = c.institution_id
        JOIN Department d ON d.id = c.department_id
        WHERE e.target_course_id = ?
        ORDER BY institution_name, department_name, code
    ''', (course_id, course_id)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/create-plan', methods=['POST'])
def create_plan():
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['plan_name', 'source_institution_id', 'target_institution_id', 'selected_courses']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Generate unique plan code
        code = generate_plan_code()
        conn = get_db_connection()
        
        # Ensure code is unique
        while conn.execute('SELECT id FROM TransferPlan WHERE code = ?', (code,)).fetchone():
            code = generate_plan_code()
        
        # Store the plan
        conn.execute('''
            INSERT INTO TransferPlan (code, plan_name, source_institution_id, target_institution_id, selected_courses, plan_data)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            code,
            data['plan_name'],
            data['source_institution_id'],
            data['target_institution_id'],
            json.dumps(data['selected_courses']),
            json.dumps(data)
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'plan_code': code,
            'message': f'Plan "{data["plan_name"]}" created successfully!'
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to create plan: {str(e)}'}), 500

@app.route('/api/get-plan/<plan_code>')
def get_plan(plan_code):
    try:
        conn = get_db_connection()
        
        plan = conn.execute('''
            SELECT tp.*, 
                   si.name as source_institution_name,
                   ti.name as target_institution_name
            FROM TransferPlan tp
            JOIN Institution si ON si.id = tp.source_institution_id
            JOIN Institution ti ON ti.id = tp.target_institution_id
            WHERE tp.code = ?
        ''', (plan_code.upper(),)).fetchone()
        
        if not plan:
            conn.close()
            return jsonify({'error': 'Plan not found'}), 404
        
        # Get detailed course information for selected courses
        selected_courses = json.loads(plan['selected_courses'])
        detailed_courses = []
        
        for course_id in selected_courses:
            course = conn.execute('''
                SELECT c.*, i.name as institution_name, d.name as department_name
                FROM Course c
                JOIN Institution i ON i.id = c.institution_id
                JOIN Department d ON d.id = c.department_id
                WHERE c.id = ?
            ''', (course_id,)).fetchone()
            
            if course:
                detailed_courses.append(dict(course))
        
        conn.close()
        
        return jsonify({
            'plan': {
                'code': plan['code'],
                'plan_name': plan['plan_name'],
                'source_institution': plan['source_institution_name'],
                'target_institution': plan['target_institution_name'],
                'created_at': plan['created_at'],
                'selected_courses': detailed_courses,
                'plan_data': json.loads(plan['plan_data'])
            }
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve plan: {str(e)}'}), 500

@app.route('/api/search-equivalents', methods=['POST'])
def search_equivalents():
    """Search for equivalents of multiple courses at once"""
    try:
        data = request.get_json()
        course_ids = data.get('course_ids', [])
        
        if not course_ids:
            return jsonify({'equivalents': {}})
        
        conn = get_db_connection()
        equivalents = {}
        
        for course_id in course_ids:
            rows = conn.execute('''
                SELECT c.*, i.name as institution_name, d.name as department_name FROM CourseEquivalency e
                JOIN Course c ON c.id = e.target_course_id
                JOIN Institution i ON i.id = c.institution_id
                JOIN Department d ON d.id = c.department_id
                WHERE e.source_course_id = ?
                UNION
                SELECT c.*, i.name as institution_name, d.name as department_name FROM CourseEquivalency e
                JOIN Course c ON c.id = e.source_course_id
                JOIN Institution i ON i.id = c.institution_id
                JOIN Department d ON d.id = c.department_id
                WHERE e.target_course_id = ?
                ORDER BY institution_name, department_name, code
            ''', (course_id, course_id)).fetchall()
            
            equivalents[course_id] = [dict(r) for r in rows]
        
        conn.close()
        return jsonify({'equivalents': equivalents})
        
    except Exception as e:
        return jsonify({'error': f'Failed to search equivalents: {str(e)}'}), 500

@app.route('/api/import', methods=['POST'])
def import_csv():
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Read and decode the file content
        content = io.StringIO(file.stream.read().decode("utf-8"))
        reader = csv.DictReader(content)

        conn = get_db_connection()
        cursor = conn.cursor()

        def get_or_create(table, fields, values):
            """Get existing record or create new one"""
            where_clause = " AND ".join([f"{field} = ?" for field in fields])
            select_query = f"SELECT id FROM {table} WHERE {where_clause}"
            
            row = cursor.execute(select_query, values).fetchone()
            if row:
                return row['id']
            
            placeholders = ','.join(['?' for _ in fields])
            insert_query = f"INSERT INTO {table} ({','.join(fields)}) VALUES ({placeholders})"
            cursor.execute(insert_query, values)
            return cursor.lastrowid

        # Process each row in the CSV
        rows_processed = 0
        for row in reader:
            # Validate required fields
            required_fields = [
                'source_institution', 'target_institution',
                'source_department', 'target_department',
                'source_code', 'source_title',
                'target_code', 'target_title'
            ]
            
            missing_fields = [field for field in required_fields if not row.get(field, '').strip()]
            if missing_fields:
                print(f"Skipping row due to missing fields: {missing_fields}")
                continue

            # Create or get institutions
            s_inst_id = get_or_create("Institution", ["name"], [row["source_institution"].strip()])
            t_inst_id = get_or_create("Institution", ["name"], [row["target_institution"].strip()])
            
            # Create or get departments
            s_dept_id = get_or_create("Department", ["name", "institution_id"], 
                                    [row["source_department"].strip(), s_inst_id])
            t_dept_id = get_or_create("Department", ["name", "institution_id"], 
                                    [row["target_department"].strip(), t_inst_id])
            
            # Create or get courses
            s_course_id = get_or_create("Course", ["code", "title", "department_id", "institution_id"],
                                      [row["source_code"].strip(), row["source_title"].strip(), 
                                       s_dept_id, s_inst_id])
            t_course_id = get_or_create("Course", ["code", "title", "department_id", "institution_id"],
                                      [row["target_code"].strip(), row["target_title"].strip(), 
                                       t_dept_id, t_inst_id])
            
            # Create equivalency relationship
            cursor.execute("""
                INSERT OR IGNORE INTO CourseEquivalency (source_course_id, target_course_id) 
                VALUES (?, ?)
            """, (s_course_id, t_course_id))
            
            rows_processed += 1

        conn.commit()
        conn.close()

        return jsonify({
            'status': 'success', 
            'message': f'Successfully imported {rows_processed} course equivalencies'
        }), 200

    except Exception as e:
        print(f"Import error: {str(e)}")
        return jsonify({'error': f'Import failed: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)