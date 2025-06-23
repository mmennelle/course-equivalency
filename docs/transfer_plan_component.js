// TransferPlan.jsx - Transfer plan management component
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './TransferPlan.css';

const TransferPlan = () => {
    const [plans, setPlans] = useState([]);
    const [activePlan, setActivePlan] = useState(null);
    const [planDetails, setPlanDetails] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPlanData, setNewPlanData] = useState({
        plan_name: '',
        target_graduation_semester: 'Fall',
        target_graduation_year: new Date().getFullYear() + 2
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchPlans();
    }, []);

    useEffect(() => {
        if (activePlan) {
            fetchPlanDetails(activePlan.id);
        }
    }, [activePlan]);

    const fetchPlans = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/transfer-plans', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlans(response.data);
            
            // Set first plan as active if none selected
            if (response.data.length > 0 && !activePlan) {
                setActivePlan(response.data[0]);
            }
        } catch (error) {
            console.error('Plans fetch error:', error);
        }
    };

    const fetchPlanDetails = async (planId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`/api/transfer-plans/${planId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setPlanDetails(response.data);
        } catch (error) {
            console.error('Plan details fetch error:', error);
        }
    };

    const createPlan = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post('/api/transfer-plans', newPlanData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setShowCreateModal(false);
            setNewPlanData({
                plan_name: '',
                target_graduation_semester: 'Fall',
                target_graduation_year: new Date().getFullYear() + 2
            });
            
            await fetchPlans(); // Refresh plans list
        } catch (error) {
            console.error('Plan creation error:', error);
            alert('Failed to create transfer plan');
        }
        
        setLoading(false);
    };

    const markCourseComplete = async (courseId, grade) => {
        try {
            const token = localStorage.getItem('token');
            await axios.patch(`/api/transfer-plan-courses/${courseId}`, {
                is_completed: true,
                grade_received: grade
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // Refresh plan details
            fetchPlanDetails(activePlan.id);
        } catch (error) {
            console.error('Mark complete error:', error);
        }
    };

    const removeCourseFromPlan = async (courseId) => {
        if (!confirm('Remove this course from your transfer plan?')) return;
        
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/transfer-plan-courses/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // Refresh plan details
            fetchPlanDetails(activePlan.id);
        } catch (error) {
            console.error('Remove course error:', error);
        }
    };

    const groupCoursesBySemester = (courses) => {
        const grouped = {};
        courses.forEach(course => {
            const key = `${course.planned_semester} ${course.planned_year}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(course);
        });
        return grouped;
    };

    const calculatePlanStats = (courses) => {
        const totalCourses = courses.length;
        const completedCourses = courses.filter(c => c.is_completed).length;
        const totalCredits = courses.reduce((sum, c) => sum + parseFloat(c.credit_hours || 0), 0);
        const completedCredits = courses
            .filter(c => c.is_completed)
            .reduce((sum, c) => sum + parseFloat(c.credit_hours || 0), 0);
        
        return {
            totalCourses,
            completedCourses,
            totalCredits,
            completedCredits,
            progressPercentage: totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0
        };
    };

    const getCurrentSemester = () => {
        const now = new Date();
        const month = now.getMonth(); // 0-11
        const year = now.getFullYear();
        
        if (month >= 7 && month <= 11) { // Aug-Dec
            return `Fall ${year}`;
        } else if (month >= 0 && month <= 4) { // Jan-May
            return `Spring ${year}`;
        } else { // Jun-Jul
            return `Summer ${year}`;
        }
    };

    return (
        <div className="transfer-plan-container">
            <div className="plan-header">
                <div className="header-content">
                    <h1>My Transfer Plans</h1>
                    <button 
                        className="create-plan-btn"
                        onClick={() => setShowCreateModal(true)}
                    >
                        Create New Plan
                    </button>
                </div>

                {/* Plan Tabs */}
                <div className="plan-tabs">
                    {plans.map(plan => (
                        <button
                            key={plan.id}
                            className={`plan-tab ${activePlan?.id === plan.id ? 'active' : ''}`}
                            onClick={() => setActivePlan(plan)}
                        >
                            {plan.plan_name}
                            <span className="course-count">
                                {plan.completed_count}/{plan.course_count} courses
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Plan Details */}
            {planDetails && (
                <div className="plan-content">
                    <div className="plan-overview">
                        <div className="plan-info">
                            <h2>{planDetails.plan_name}</h2>
                            <p>Target Graduation: {planDetails.target_graduation_semester} {planDetails.target_graduation_year}</p>
                        </div>

                        <div className="plan-stats">
                            {(() => {
                                const stats = calculatePlanStats(planDetails.courses);
                                return (
                                    <>
                                        <div className="stat">
                                            <span className="stat-number">{stats.completedCourses}</span>
                                            <span className="stat-label">of {stats.totalCourses} courses</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-number">{stats.completedCredits}</span>
                                            <span className="stat-label">of {stats.totalCredits} credits</span>
                                        </div>
                                        <div className="progress-bar">
                                            <div 
                                                className="progress-fill"
                                                style={{ width: `${stats.progressPercentage}%` }}
                                            ></div>
                                        </div>
                                        <span className="progress-text">
                                            {stats.progressPercentage.toFixed(1)}% Complete
                                        </span>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Course Timeline */}
                    <div className="course-timeline">
                        {Object.entries(groupCoursesBySemester(planDetails.courses)).map(([semester, courses]) => (
                            <div key={semester} className="semester-section">
                                <div className="semester-header">
                                    <h3>{semester}</h3>
                                    <span className="semester-credits">
                                        {courses.reduce((sum, c) => sum + parseFloat(c.credit_hours || 0), 0)} credits
                                    </span>
                                    {semester === getCurrentSemester() && (
                                        <span className="current-semester">Current</span>
                                    )}
                                </div>

                                <div className="semester-courses">
                                    {courses.map(course => (
                                        <div 
                                            key={course.id} 
                                            className={`course-item ${course.is_completed ? 'completed' : ''}`}
                                        >
                                            <div className="course-main">
                                                <div className="course-header">
                                                    <h4>{course.course_code}</h4>
                                                    <span className="course-credits">{course.credit_hours} cr</span>
                                                </div>
                                                <h5>{course.title}</h5>
                                                <p className="course-department">{course.department_name}</p>

                                                {course.uno_equivalent_code && (
                                                    <div className="equivalency-info">
                                                        <span className="transfers-to">
                                                            → UNO: {course.uno_equivalent_code}
                                                        </span>
                                                        <span className="equivalency-type">
                                                            ({course.equivalency_type})
                                                        </span>
                                                    </div>
                                                )}

                                                {course.prerequisites && (
                                                    <p className="prerequisites">
                                                        <strong>Prerequisites:</strong> {course.prerequisites}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="course-actions">
                                                {course.is_completed ? (
                                                    <div className="completion-info">
                                                        <span className="completed-badge">✓ Completed</span>
                                                        {course.grade_received && (
                                                            <span className="grade">Grade: {course.grade_received}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="action-buttons">
                                                        <select 
                                                            onChange={(e) => {
                                                                if (e.target.value) {
                                                                    markCourseComplete(course.id, e.target.value);
                                                                }
                                                            }}
                                                            defaultValue=""
                                                        >
                                                            <option value="">Mark Complete</option>
                                                            <option value="A">A</option>
                                                            <option value="B">B</option>
                                                            <option value="C">C</option>
                                                            <option value="D">D</option>
                                                            <option value="F">F</option>
                                                            <option value="P">P (Pass)</option>
                                                        </select>
                                                        <button 
                                                            className="remove-btn"
                                                            onClick={() => removeCourseFromPlan(course.id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Create Plan Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>Create New Transfer Plan</h3>
                        <form onSubmit={createPlan}>
                            <div className="form-group">
                                <label>Plan Name</label>
                                <input
                                    type="text"
                                    value={newPlanData.plan_name}
                                    onChange={(e) => setNewPlanData({
                                        ...newPlanData,
                                        plan_name: e.target.value
                                    })}
                                    placeholder="e.g., Computer Science Transfer Plan"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Target Graduation Semester</label>
                                <select
                                    value={newPlanData.target_graduation_semester}
                                    onChange={(e) => setNewPlanData({
                                        ...newPlanData,
                                        target_graduation_semester: e.target.value
                                    })}
                                >
                                    <option value="Spring">Spring</option>
                                    <option value="Summer">Summer</option>
                                    <option value="Fall">Fall</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Target Graduation Year</label>
                                <input
                                    type="number"
                                    value={newPlanData.target_graduation_year}
                                    onChange={(e) => setNewPlanData({
                                        ...newPlanData,
                                        target_graduation_year: parseInt(e.target.value)
                                    })}
                                    min={new Date().getFullYear()}
                                    max={new Date().getFullYear() + 10}
                                />
                            </div>

                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    onClick={() => setShowCreateModal(false)}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="primary"
                                >
                                    {loading ? 'Creating...' : 'Create Plan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransferPlan;