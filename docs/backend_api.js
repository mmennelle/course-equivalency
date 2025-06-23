// server.js - Main Express server
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'course_transfer',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.sendStatus(401);
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// COURSE SEARCH ENDPOINTS

// Search Delgado courses with robust filtering
app.get('/api/courses/search', async (req, res) => {
    try {
        const { 
            query, 
            department, 
            credit_hours, 
            has_equivalency = 'all',
            limit = 50,
            offset = 0 
        } = req.query;

        let sql = `
            SELECT 
                c.*,
                d.name as department_name,
                d.code as department_code,
                i.name as institution_name,
                CASE 
                    WHEN ce.id IS NOT NULL THEN true 
                    ELSE false 
                END as has_equivalency,
                uc.title as uno_equivalent_title,
                uc.course_code as uno_equivalent_code
            FROM courses c
            JOIN departments d ON c.department_id = d.id
            JOIN institutions i ON c.institution_id = i.id
            LEFT JOIN course_equivalencies ce ON c.id = ce.delgado_course_id AND ce.is_active = true
            LEFT JOIN courses uc ON ce.uno_course_id = uc.id
            WHERE c.institution_id = 1 AND c.is_active = true
        `;

        const params = [];

        // Add search query filter
        if (query) {
            sql += ` AND (
                c.course_code LIKE ? OR 
                c.title LIKE ? OR 
                c.description LIKE ? OR
                CONCAT(c.course_code, ' ', c.course_number) LIKE ?
            )`;
            const searchTerm = `%${query}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Add department filter
        if (department) {
            sql += ` AND d.code = ?`;
            params.push(department);
        }

        // Add credit hours filter
        if (credit_hours) {
            sql += ` AND c.credit_hours = ?`;
            params.push(credit_hours);
        }

        // Add equivalency filter
        if (has_equivalency === 'yes') {
            sql += ` AND ce.id IS NOT NULL`;
        } else if (has_equivalency === 'no') {
            sql += ` AND ce.id IS NULL`;
        }

        sql += ` ORDER BY c.course_code, c.course_number LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get course equivalency details
app.get('/api/courses/:courseId/equivalency', async (req, res) => {
    try {
        const { courseId } = req.params;
        
        const sql = `
            SELECT 
                ce.*,
                dc.course_code as delgado_code,
                dc.title as delgado_title,
                dc.credit_hours as delgado_credits,
                uc.course_code as uno_code,
                uc.title as uno_title,
                uc.credit_hours as uno_credits,
                uc.prerequisites as uno_prerequisites
            FROM course_equivalencies ce
            JOIN courses dc ON ce.delgado_course_id = dc.id
            JOIN courses uc ON ce.uno_course_id = uc.id
            WHERE ce.delgado_course_id = ? AND ce.is_active = true
        `;
        
        const [rows] = await pool.execute(sql, [courseId]);
        res.json(rows[0] || null);
    } catch (error) {
        console.error('Equivalency fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch equivalency' });
    }
});

// Get all departments
app.get('/api/departments', async (req, res) => {
    try {
        const sql = `
            SELECT DISTINCT d.code, d.name, COUNT(c.id) as course_count
            FROM departments d
            JOIN courses c ON d.id = c.department_id
            WHERE d.institution_id = 1 AND c.is_active = true
            GROUP BY d.id, d.code, d.name
            ORDER BY d.code
        `;
        
        const [rows] = await pool.execute(sql);
        res.json(rows);
    } catch (error) {
        console.error('Departments fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

// TRANSFER PLAN ENDPOINTS

// Create transfer plan
app.post('/api/transfer-plans', authenticateToken, async (req, res) => {
    try {
        const { plan_name, target_graduation_semester, target_graduation_year } = req.body;
        
        const sql = `
            INSERT INTO transfer_plans (user_id, plan_name, target_graduation_semester, target_graduation_year)
            VALUES (?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            req.user.id, 
            plan_name, 
            target_graduation_semester, 
            target_graduation_year
        ]);
        
        res.json({ id: result.insertId, message: 'Transfer plan created successfully' });
    } catch (error) {
        console.error('Plan creation error:', error);
        res.status(500).json({ error: 'Failed to create transfer plan' });
    }
});

// Get user's transfer plans
app.get('/api/transfer-plans', authenticateToken, async (req, res) => {
    try {
        const sql = `
            SELECT 
                tp.*,
                COUNT(tpc.id) as course_count,
                SUM(CASE WHEN tpc.is_completed THEN 1 ELSE 0 END) as completed_count
            FROM transfer_plans tp
            LEFT JOIN transfer_plan_courses tpc ON tp.id = tpc.transfer_plan_id
            WHERE tp.user_id = ? AND tp.is_active = true
            GROUP BY tp.id
            ORDER BY tp.created_at DESC
        `;
        
        const [rows] = await pool.execute(sql, [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error('Plans fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch transfer plans' });
    }
});

// Add course to transfer plan
app.post('/api/transfer-plans/:planId/courses', authenticateToken, async (req, res) => {
    try {
        const { planId } = req.params;
        const { delgado_course_id, planned_semester, planned_year } = req.body;
        
        // Verify plan belongs to user
        const planCheck = await pool.execute(
            'SELECT id FROM transfer_plans WHERE id = ? AND user_id = ?',
            [planId, req.user.id]
        );
        
        if (planCheck[0].length === 0) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const sql = `
            INSERT INTO transfer_plan_courses (transfer_plan_id, delgado_course_id, planned_semester, planned_year)
            VALUES (?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            planId, 
            delgado_course_id, 
            planned_semester, 
            planned_year
        ]);
        
        res.json({ id: result.insertId, message: 'Course added to plan' });
    } catch (error) {
        console.error('Add course error:', error);
        res.status(500).json({ error: 'Failed to add course to plan' });
    }
});

// Get transfer plan details with courses
app.get('/api/transfer-plans/:planId', authenticateToken, async (req, res) => {
    try {
        const { planId } = req.params;
        
        const planSql = `
            SELECT * FROM transfer_plans 
            WHERE id = ? AND user_id = ? AND is_active = true
        `;
        
        const coursesSql = `
            SELECT 
                tpc.*,
                c.course_code,
                c.title,
                c.credit_hours,
                c.prerequisites,
                d.name as department_name,
                ce.equivalency_type,
                uc.course_code as uno_equivalent_code,
                uc.title as uno_equivalent_title
            FROM transfer_plan_courses tpc
            JOIN courses c ON tpc.delgado_course_id = c.id
            JOIN departments d ON c.department_id = d.id
            LEFT JOIN course_equivalencies ce ON c.id = ce.delgado_course_id AND ce.is_active = true
            LEFT JOIN courses uc ON ce.uno_course_id = uc.id
            WHERE tpc.transfer_plan_id = ?
            ORDER BY tpc.planned_year, tpc.planned_semester, c.course_code
        `;
        
        const [planRows] = await pool.execute(planSql, [planId, req.user.id]);
        const [courseRows] = await pool.execute(coursesSql, [planId]);
        
        if (planRows.length === 0) {
            return res.status(404).json({ error: 'Transfer plan not found' });
        }
        
        const plan = planRows[0];
        plan.courses = courseRows;
        
        res.json(plan);
    } catch (error) {
        console.error('Plan details error:', error);
        res.status(500).json({ error: 'Failed to fetch plan details' });
    }
});

// USER AUTHENTICATION ENDPOINTS

// Register user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, first_name, last_name, delgado_student_id, intended_major } = req.body;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const sql = `
            INSERT INTO users (email, first_name, last_name, delgado_student_id, intended_major)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            email, first_name, last_name, delgado_student_id, intended_major
        ]);
        
        const token = jwt.sign(
            { id: result.insertId, email }, 
            process.env.JWT_SECRET || 'your-secret-key'
        );
        
        res.json({ token, user: { id: result.insertId, email, first_name, last_name } });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const sql = 'SELECT * FROM users WHERE email = ?';
        const [rows] = await pool.execute(sql, [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email }, 
            process.env.JWT_SECRET || 'your-secret-key'
        );
        
        res.json({ 
            token, 
            user: { 
                id: user.id, 
                email: user.email, 
                first_name: user.first_name, 
                last_name: user.last_name 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});