# Course Equivalency Finder

A comprehensive web application for managing and discovering course equivalencies between educational institutions, with advanced plan generation and sharing capabilities.

## 🎯 Project Overview

The Course Equivalency Finder is a full-stack web application designed to help students, academic advisors, and educational institutions manage course transfer equivalencies. The system allows users to browse course catalogs, discover equivalent courses across institutions, and create shareable transfer plans with unique access codes.

## 🏗️ System Architecture

### Backend Architecture (Flask)
- **Framework**: Flask with CORS support
- **Database**: SQLite with SQLAlchemy-style queries
- **Data Storage**: Relational database with foreign key constraints
- **File Processing**: CSV import functionality with validation
- **Plan Management**: Unique code generation and expiration handling

### Frontend Architecture (React)
- **Framework**: React 18 with functional components and hooks
- **State Management**: Local component state with useState and useEffect
- **API Communication**: Axios for HTTP requests
- **UI Pattern**: Single-page application with tab-based navigation
- **Styling**: Inline CSS with responsive design principles

## 📊 Database Schema

### Core Tables

#### Institution
```sql
CREATE TABLE Institution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);
```

#### Department
```sql
CREATE TABLE Department (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution_id INTEGER NOT NULL,
    FOREIGN KEY (institution_id) REFERENCES Institution (id),
    UNIQUE(name, institution_id)
);
```

#### Course
```sql
CREATE TABLE Course (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    institution_id INTEGER NOT NULL,
    FOREIGN KEY (department_id) REFERENCES Department (id),
    FOREIGN KEY (institution_id) REFERENCES Institution (id),
    UNIQUE(code, department_id, institution_id)
);
```

#### CourseEquivalency
```sql
CREATE TABLE CourseEquivalency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_course_id INTEGER NOT NULL,
    target_course_id INTEGER NOT NULL,
    FOREIGN KEY (source_course_id) REFERENCES Course (id),
    FOREIGN KEY (target_course_id) REFERENCES Course (id),
    UNIQUE(source_course_id, target_course_id)
);
```

#### TransferPlan
```sql
CREATE TABLE TransferPlan (
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
);
```

## 🔗 API Endpoints

### Data Retrieval Endpoints

#### `GET /api/institutions`
- **Purpose**: Retrieve all institutions with automatic cleanup of expired plans
- **Response**: Array of institution objects
- **Features**: Alphabetically sorted results

#### `GET /api/departments?institution_id={id}`
- **Purpose**: Get departments for a specific institution
- **Parameters**: `institution_id` (required)
- **Response**: Array of department objects

#### `GET /api/courses?department_id={id}`
- **Purpose**: Get courses for a specific department
- **Parameters**: `department_id` (required)
- **Response**: Array of course objects sorted by course code

#### `GET /api/equivalents?course_id={id}`
- **Purpose**: Find equivalent courses using bidirectional search
- **Parameters**: `course_id` (required)
- **Response**: Array of equivalent courses with institution and department details
- **Algorithm**: UNION query to find both source→target and target→source relationships

### Plan Management Endpoints

#### `POST /api/create-plan`
- **Purpose**: Create a new transfer plan with unique code generation
- **Request Body**:
  ```json
  {
    "plan_name": "string",
    "source_institution_id": "integer",
    "target_institution_id": "integer",
    "selected_courses": ["array of course IDs"],
    "additional_data": "object"
  }
  ```
- **Response**: Plan code and success confirmation
- **Features**: 
  - 8-character alphanumeric code generation
  - Collision detection and regeneration
  - JSON serialization of course data

#### `GET /api/get-plan/{plan_code}`
- **Purpose**: Retrieve complete plan details by code
- **Parameters**: `plan_code` (case-insensitive)
- **Response**: Full plan object with expanded course details
- **Error Handling**: 404 for non-existent plans

#### `POST /api/search-equivalents`
- **Purpose**: Batch search for multiple course equivalents
- **Request Body**: `{"course_ids": ["array of IDs"]}`
- **Response**: Object mapping course IDs to their equivalents
- **Use Case**: Efficient bulk operations for plan analysis

### Data Import Endpoint

#### `POST /api/import`
- **Purpose**: Bulk import course equivalencies from CSV
- **Request**: Multipart form data with CSV file
- **CSV Format**:
  ```csv
  source_institution,source_department,source_code,source_title,target_institution,target_department,target_code,target_title
  ```
- **Features**:
  - Automatic entity creation (institutions, departments, courses)
  - Duplicate prevention with `INSERT OR IGNORE`
  - Comprehensive validation and error reporting
  - Transaction-based processing for data integrity

## 🎨 Frontend Components

### State Management Architecture

```javascript
// Core browsing state
const [institutions, setInstitutions] = useState([]);
const [departments, setDepartments] = useState([]);
const [courses, setCourses] = useState([]);
const [equivalents, setEquivalents] = useState([]);

// Navigation state
const [expandedInstitution, setExpandedInstitution] = useState(null);
const [expandedDepartment, setExpandedDepartment] = useState(null);
const [selectedCourse, setSelectedCourse] = useState(null);

// Plan management state
const [selectedCourses, setSelectedCourses] = useState([]);
const [planName, setPlanName] = useState('');
const [currentView, setCurrentView] = useState('browse');
```

### Component Hierarchy

1. **App Component** (Root)
   - Navigation system
   - State management
   - API communication
   
2. **Browse View**
   - Hierarchical institution/department/course tree
   - Course selection interface
   - Equivalent course display with action buttons
   
3. **Create Plan View**
   - Form-based plan creation
   - Institution selection
   - Course review and management
   - Plan code generation display
   
4. **View Plan View**
   - Plan detail display
   - Course list with metadata
   - Navigation controls

### User Interaction Patterns

#### Course Discovery Flow
1. User expands institution to view departments
2. User expands department to view courses
3. User clicks course to view equivalents
4. User adds equivalent courses to plan using action buttons

#### Plan Creation Flow
1. User accumulates courses in selection state
2. User navigates to "Create Plan" view
3. User fills plan metadata (name, institutions)
4. System generates unique 8-character code
5. User receives shareable plan code

#### Plan Retrieval Flow
1. User enters plan code in search field
2. System validates and retrieves plan data
3. System displays comprehensive plan details
4. User can navigate back to browsing

## 🔧 Technical Implementation Details

### Code Generation Algorithm
```python
def generate_plan_code():
    """Generate a unique 8-character alphanumeric code"""
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
```
- Uses cryptographically secure random generation
- 8-character format: ~2.8 trillion possible combinations
- Collision detection with regeneration logic

### Data Expiration System
```python
def cleanup_expired_plans():
    """Remove plans older than 1 year"""
    cutoff_date = datetime.now() - timedelta(days=365)
    conn.execute('DELETE FROM TransferPlan WHERE created_at < ?', (cutoff_date,))
```
- Automatic cleanup on institution endpoint calls
- 365-day retention policy
- Prevents database bloat from abandoned plans

### CSV Import Processing
```python
def get_or_create(table, fields, values):
    """Get existing record or create new one"""
    # Query for existing record
    # Insert if not found
    # Return ID for relationship building
```
- Idempotent operations prevent duplicates
- Hierarchical entity creation (Institution → Department → Course)
- Comprehensive error handling and validation

### Bidirectional Equivalency Search
```sql
SELECT c.* FROM CourseEquivalency e
JOIN Course c ON c.id = e.target_course_id
WHERE e.source_course_id = ?
UNION
SELECT c.* FROM CourseEquivalency e
JOIN Course c ON c.id = e.source_course_id
WHERE e.target_course_id = ?
```
- Searches both directions of equivalency relationships
- Ensures comprehensive results regardless of data entry direction
- Includes institution and department metadata in results

## 🚀 Deployment Instructions

### Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database
python app.py  # Database tables created automatically

# Run development server
python app.py
```

### Frontend Setup
```bash
# Install dependencies
npm install

# Start development server
npm start
```

### Production Considerations
- Configure CORS for production domains
- Implement database connection pooling
- Add authentication for plan management
- Set up automated database backups
- Configure logging for audit trails

## 📈 Performance Characteristics

### Database Performance
- Indexed foreign key relationships
- Efficient UNION queries for equivalency search
- Automatic cleanup prevents table bloat
- SQLite suitable for moderate concurrent users

### Frontend Performance
- Lazy loading of hierarchical data
- Efficient state updates with dependency arrays
- Minimal re-renders with proper key props
- Local state management avoids prop drilling

### Scalability Considerations
- Stateless backend design enables horizontal scaling
- Database schema supports millions of course records
- Plan storage uses JSON for flexible metadata
- API design supports efficient batch operations

## 🔒 Security Features

### Data Validation
- Required field validation on all endpoints
- SQL injection prevention through parameterized queries
- File upload validation for CSV imports
- Input sanitization and trimming

### Plan Security
- Cryptographically secure code generation
- No personal information required for plan access
- Automatic expiration prevents indefinite storage
- Case-insensitive code lookup for usability

## 🧪 Testing Recommendations

### Backend Testing
- Unit tests for equivalency search logic
- Integration tests for CSV import functionality
- Performance tests for large dataset operations
- Security tests for SQL injection prevention

### Frontend Testing
- Component unit tests with React Testing Library
- Integration tests for user workflows
- E2E tests for complete plan creation/retrieval cycles
- Accessibility testing for screen reader compatibility

## 📋 Future Enhancement Opportunities

### Technical Enhancements
- Database migration to PostgreSQL for production
- Redis caching for frequently accessed data
- GraphQL API for flexible data fetching
- Real-time updates with WebSocket connections

### Feature Enhancements
- User accounts and plan ownership
- Plan collaboration and sharing
- Advanced search and filtering capabilities
- Export functionality for plan data
- Integration with institutional APIs

### Analytics & Monitoring
- Usage analytics for popular equivalencies
- Performance monitoring and alerting
- Audit logging for data changes
- Plan usage statistics and trends

---

## 📦 Dependencies

### Backend Dependencies
```
Flask==3.1.1
flask-cors==6.0.1
blinker==1.9.0
click==8.2.1
colorama==0.4.6
itsdangerous==2.2.0
Jinja2==3.1.6
MarkupSafe==3.0.2
Werkzeug==3.1.3
```

### Frontend Dependencies
```
react==18.2.0
react-dom==18.2.0
react-scripts==5.0.1
axios==1.10.0
```

This application demonstrates modern full-stack development practices with emphasis on data integrity, user experience, and scalable architecture design.