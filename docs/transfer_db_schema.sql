-- === CORE STRUCTURE ===

CREATE TABLE institutions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    abbreviation VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    institution_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE TABLE courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    institution_id INT NOT NULL,
    department_id INT,
    course_code VARCHAR(20) NOT NULL,
    course_number VARCHAR(10) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    credit_hours DECIMAL(3,1),
    prerequisites TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    UNIQUE KEY unique_course (institution_id, course_code, course_number)
);

CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    student_id VARCHAR(50),
    intended_major VARCHAR(255),
    role ENUM('student', 'admin') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === TRANSFER PLANNING ===

CREATE TABLE transfer_plans (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    plan_name VARCHAR(255) NOT NULL,
    target_graduation_semester VARCHAR(20),
    target_graduation_year YEAR,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE transfer_plan_courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    transfer_plan_id INT NOT NULL,
    course_id INT NOT NULL,
    planned_semester VARCHAR(20),
    planned_year YEAR,
    is_completed BOOLEAN DEFAULT FALSE,
    grade_received VARCHAR(5),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transfer_plan_id) REFERENCES transfer_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id)
);

-- === COURSE EQUIVALENCY MODEL ===

CREATE TABLE course_equivalency_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    equivalency_type ENUM('direct', 'partial', 'elective') DEFAULT 'direct',
    notes TEXT,
    effective_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_reviewed_at TIMESTAMP NULL,
    proposed_by INT,
    approved_by INT,
    status ENUM('proposed', 'approved', 'rejected') DEFAULT 'proposed',
    FOREIGN KEY (proposed_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE course_equivalency_courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT NOT NULL,
    course_id INT NOT NULL,
    direction ENUM('from', 'to') NOT NULL,
    FOREIGN KEY (group_id) REFERENCES course_equivalency_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE equivalency_review_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT NOT NULL,
    reviewer_id INT NOT NULL,
    action ENUM('proposed', 'approved', 'rejected', 'commented') NOT NULL,
    comment TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES course_equivalency_groups(id),
    FOREIGN KEY (reviewer_id) REFERENCES users(id)
);
