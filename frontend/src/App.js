import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [institutions, setInstitutions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [equivalents, setEquivalents] = useState([]);
  
  const [expandedInstitution, setExpandedInstitution] = useState(null);
  const [expandedDepartment, setExpandedDepartment] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  
  // Plan management state
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [planName, setPlanName] = useState('');
  const [sourceInstitution, setSourceInstitution] = useState('');
  const [targetInstitution, setTargetInstitution] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [loadedPlan, setLoadedPlan] = useState(null);
  const [currentView, setCurrentView] = useState('browse'); // 'browse', 'create-plan', 'view-plan', 'edit-plan'
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    axios.get('/api/institutions').then(res => setInstitutions(res.data));
  }, []);

  useEffect(() => {
    if (expandedInstitution) {
      axios.get(`/api/departments?institution_id=${expandedInstitution}`)
        .then(res => setDepartments(res.data));
    } else {
      setDepartments([]);
      setCourses([]);
      setEquivalents([]);
    }
  }, [expandedInstitution]);

  useEffect(() => {
    if (expandedDepartment) {
      axios.get(`/api/courses?department_id=${expandedDepartment}`)
        .then(res => setCourses(res.data));
    } else {
      setCourses([]);
      setEquivalents([]);
    }
  }, [expandedDepartment]);

  useEffect(() => {
    if (selectedCourse) {
      axios.get(`/api/equivalents?course_id=${selectedCourse}`)
        .then(res => setEquivalents(res.data));
    } else {
      setEquivalents([]);
    }
  }, [selectedCourse]);

  const handleImport = async (e) => {
    e.preventDefault();
    const fileInput = e.target.elements.file;
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    
    try {
      const response = await axios.post("/api/import", formData);
      alert("Import complete: " + response.data.message);
      window.location.reload();
    } catch (error) {
      alert("Import failed: " + (error.response?.data?.error || "Unknown error"));
    }
  };

  const toggleCourseSelection = (course) => {
    const isSelected = selectedCourses.some(c => c.id === course.id);
    if (isSelected) {
      setSelectedCourses(selectedCourses.filter(c => c.id !== course.id));
    } else {
      setSelectedCourses([...selectedCourses, course]);
    }
  };

  const createPlan = async () => {
    if (!planName.trim()) {
      alert('Please enter a plan name');
      return;
    }
    if (selectedCourses.length === 0) {
      alert('Please select at least one course');
      return;
    }
    if (!sourceInstitution || !targetInstitution) {
      alert('Please select source and target institutions');
      return;
    }

    try {
      const response = await axios.post('/api/create-plan', {
        plan_name: planName,
        source_institution_id: sourceInstitution,
        target_institution_id: targetInstitution,
        selected_courses: selectedCourses.map(c => c.id),
        additional_data: {
          total_courses: selectedCourses.length,
          created_by_user: true
        }
      });

      setPlanCode(response.data.plan_code);
      alert(`Plan created successfully! Your plan code is: ${response.data.plan_code}`);
      
    } catch (error) {
      alert('Failed to create plan: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const updatePlan = async () => {
    if (!loadedPlan) {
      alert('Error: No plan loaded for editing');
      return;
    }
    
    console.log('Updating plan with code:', loadedPlan.code); // Debug log
    
    if (!planName.trim()) {
      alert('Please enter a plan name');
      return;
    }
    if (selectedCourses.length === 0) {
      alert('Please select at least one course');
      return;
    }
    if (!sourceInstitution || !targetInstitution) {
      alert('Please select source and target institutions');
      return;
    }

    try {
      console.log('Making PUT request to:', `/api/update-plan/${loadedPlan.code}`); // Debug log
      
      const response = await axios.put(`/api/update-plan/${loadedPlan.code}`, {
        plan_name: planName,
        source_institution_id: sourceInstitution,
        target_institution_id: targetInstitution,
        selected_courses: selectedCourses.map(c => c.id),
        additional_data: {
          total_courses: selectedCourses.length,
          updated_by_user: true,
          last_updated: new Date().toISOString()
        }
      });

      console.log('Update response:', response.data); // Debug log
      alert(`Plan updated successfully! Your plan code remains: ${loadedPlan.code}`);
      
      // Reload the updated plan using the SAME code
      const updatedPlan = await axios.get(`/api/get-plan/${loadedPlan.code}`);
      setLoadedPlan(updatedPlan.data.plan);
      setIsEditMode(false);
      setCurrentView('view-plan');
      
    } catch (error) {
      console.error('Update error:', error); // Debug log
      alert('Failed to update plan: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const deletePlan = async () => {
    if (!loadedPlan) return;
    
    const confirmDelete = window.confirm(`Are you sure you want to delete the plan "${loadedPlan.plan_name}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/delete-plan/${loadedPlan.code}`);
      alert('Plan deleted successfully!');
      
      // Reset state and go back to browse
      setLoadedPlan(null);
      setSearchCode('');
      setSelectedCourses([]);
      setPlanName('');
      setSourceInstitution('');
      setTargetInstitution('');
      setIsEditMode(false);
      setCurrentView('browse');
      
    } catch (error) {
      alert('Failed to delete plan: ' + (error.response?.data?.error || 'Unknown error'));
    }
  };

  const startEditMode = () => {
    if (loadedPlan) {
      // Populate form with current plan data
      setPlanName(loadedPlan.plan_name);
      setSourceInstitution(loadedPlan.plan_data.source_institution_id);
      setTargetInstitution(loadedPlan.plan_data.target_institution_id);
      setSelectedCourses(loadedPlan.selected_courses);
      setIsEditMode(true);
      setCurrentView('edit-plan');
    }
  };

  const cancelEdit = () => {
    // Ask for confirmation if there are unsaved changes
    const hasChanges = 
      planName !== loadedPlan?.plan_name ||
      sourceInstitution !== loadedPlan?.plan_data?.source_institution_id ||
      targetInstitution !== loadedPlan?.plan_data?.target_institution_id ||
      selectedCourses.length !== loadedPlan?.selected_courses?.length;
    
    if (hasChanges) {
      const confirmCancel = window.confirm('You have unsaved changes. Are you sure you want to cancel editing?');
      if (!confirmCancel) return;
    }
    
    setIsEditMode(false);
    setCurrentView('view-plan');
    // Reset form data to original plan data
    setPlanName('');
    setSourceInstitution('');
    setTargetInstitution('');
    setSelectedCourses([]);
  };

  const loadPlan = async () => {
    if (!searchCode.trim()) {
      alert('Please enter a plan code');
      return;
    }

    try {
      const response = await axios.get(`/api/get-plan/${searchCode.trim()}`);
      setLoadedPlan(response.data.plan);
      setCurrentView('view-plan');
    } catch (error) {
      if (error.response?.status === 404) {
        alert('Plan not found. Please check your code and try again.');
      } else {
        alert('Failed to load plan: ' + (error.response?.data?.error || 'Unknown error'));
      }
    }
  };

  const resetPlanCreation = () => {
    setSelectedCourses([]);
    setPlanName('');
    setSourceInstitution('');
    setTargetInstitution('');
    setPlanCode('');
    setIsEditMode(false);
    setCurrentView('browse');
  };

  // Navigation
  const renderNavigation = () => (
    <div style={{ marginBottom: '20px', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
      {/* Show edit mode indicator */}
      {isEditMode && (
        <div style={{ 
          marginBottom: '10px', 
          padding: '8px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          <strong>🔧 EDIT MODE:</strong> Editing plan "{loadedPlan?.plan_name}" (Code: {loadedPlan?.code})
        </div>
      )}
      
      <button 
        onClick={() => setCurrentView('browse')}
        style={{ 
          marginRight: '10px', 
          padding: '8px 16px',
          backgroundColor: currentView === 'browse' ? '#007bff' : '#f8f9fa',
          color: currentView === 'browse' ? 'white' : 'black',
          border: '1px solid #007bff',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {isEditMode ? 'Browse Courses (Add to Plan)' : 'Browse Courses'}
      </button>
      
      <button 
        onClick={() => setCurrentView(isEditMode ? 'edit-plan' : 'create-plan')}
        style={{ 
          marginRight: '10px', 
          padding: '8px 16px',
          backgroundColor: (currentView === 'create-plan' || currentView === 'edit-plan') ? '#28a745' : '#f8f9fa',
          color: (currentView === 'create-plan' || currentView === 'edit-plan') ? 'white' : 'black',
          border: '1px solid #28a745',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {isEditMode ? `Edit Plan (${selectedCourses.length} courses selected)` : `Create Plan (${selectedCourses.length} courses selected)`}
      </button>
      
      {!isEditMode && (
        <>
          <input
            type="text"
            placeholder="Enter plan code"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
            style={{ 
              marginRight: '10px', 
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: '120px'
            }}
          />
          <button 
            onClick={loadPlan}
            style={{ 
              padding: '8px 16px',
              backgroundColor: '#ffc107',
              color: 'black',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load Plan
          </button>
        </>
      )}
      
      {isEditMode && (
        <button 
          onClick={cancelEdit}
          style={{ 
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: '1px solid #6c757d',
            borderRadius: '4px',
            cursor: 'pointer',
            marginLeft: '10px'
          }}
        >
          Cancel Edit
        </button>
      )}
    </div>
  );

  // Browse View
  const renderBrowseView = () => (
    <div>
      {/* Show edit mode indicator in browse view */}
      {isEditMode && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: '#e3f2fd', 
          border: '1px solid #2196f3', 
          borderRadius: '8px'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#1976d2' }}>
            🔧 Adding Courses to Existing Plan
          </h3>
          <p style={{ margin: '0', color: '#333' }}>
            You are editing "<strong>{loadedPlan?.plan_name}</strong>" (Code: {loadedPlan?.code}). 
            Add courses below and they will be included in your existing plan.
          </p>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
            Currently selected: {selectedCourses.length} courses
          </p>
        </div>
      )}
      
      <div>
        {institutions.map(inst => (
          <div key={inst.id} style={{ marginBottom: '10px' }}>
            <div
              style={{ cursor: 'pointer', fontWeight: 'bold' }}
              onClick={() => {
                setExpandedInstitution(inst.id === expandedInstitution ? null : inst.id);
                setExpandedDepartment(null);
                setSelectedCourse(null);
              }}
            >
              [{inst.id === expandedInstitution ? '-' : '+'}] {inst.name}
            </div>

            {inst.id === expandedInstitution && (
              <div style={{ marginLeft: '20px' }}>
                {departments.map(dept => (
                  <div key={dept.id}>
                    <div
                      style={{ cursor: 'pointer', fontStyle: 'italic' }}
                      onClick={() => {
                        setExpandedDepartment(dept.id === expandedDepartment ? null : dept.id);
                        setSelectedCourse(null);
                      }}
                    >
                      [{dept.id === expandedDepartment ? '-' : '+'}] {dept.name}
                    </div>

                    {dept.id === expandedDepartment && (
                      <div style={{ marginLeft: '20px' }}>
                        {courses.map(course => {
                          return (
                            <div
                              key={course.id}
                              style={{ 
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                margin: '2px 0'
                              }}
                              onClick={() => setSelectedCourse(course.id)}
                            >
                              <span>{course.code}: {course.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedCourse && (
        <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2>Equivalent Courses</h2>
          {equivalents.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {equivalents.map(e => {
                const isSelected = selectedCourses.some(c => c.id === e.id);
                return (
                  <li key={e.id} style={{ 
                    marginBottom: '10px', 
                    padding: '10px', 
                    border: '1px solid #eee', 
                    borderRadius: '6px',
                    backgroundColor: isSelected ? '#e3f2fd' : '#f9f9f9',
                    borderColor: isSelected ? '#2196f3' : '#eee'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{e.code}: {e.title}</strong>
                        <br />
                        <small style={{ color: '#666' }}>{e.institution_name} - {e.department_name}</small>
                      </div>
                      <button
                        onClick={() => toggleCourseSelection(e)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '14px',
                          backgroundColor: isSelected ? '#f44336' : '#4caf50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        {isSelected ? 'Remove from Plan' : `Add to ${isEditMode ? 'Existing' : ''} Plan`}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No equivalent courses found.</p>
          )}
        </div>
      )}
    </div>
  );

  // Create Plan View
  const renderCreatePlanView = () => (
    <div>
      <h2>Create Transfer Plan</h2>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Plan Name:</label>
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="Enter a name for your transfer plan"
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Source Institution:</label>
            <select
              value={sourceInstitution}
              onChange={(e) => setSourceInstitution(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <option value="">Select source institution</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Target Institution:</label>
            <select
              value={targetInstitution}
              onChange={(e) => setTargetInstitution(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <option value="">Select target institution</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong>Selected Courses ({selectedCourses.length}):</strong>
          {selectedCourses.length > 0 ? (
            <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', borderRadius: '4px' }}>
              {selectedCourses.map((course, index) => (
                <div key={course.id} style={{ padding: '5px', borderBottom: '1px solid #f0f0f0' }}>
                  <span>{course.code}: {course.title}</span>
                  <button
                    onClick={() => toggleCourseSelection(course)}
                    style={{
                      marginLeft: '10px',
                      padding: '2px 6px',
                      fontSize: '12px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: '10px', fontStyle: 'italic', color: '#666' }}>
              No courses selected. Go to "Browse Courses" to add courses to your plan.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={createPlan}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Create Plan
          </button>
          <button
            onClick={resetPlanCreation}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
        </div>

        {planCode && (
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '4px' }}>
            <strong>Plan Created Successfully!</strong>
            <br />
            <span style={{ fontSize: '18px', fontFamily: 'monospace', backgroundColor: '#fff', padding: '5px', border: '1px solid #ddd', borderRadius: '3px' }}>
              {planCode}
            </span>
            <br />
            <small>Save this code to access your plan later. Plans are stored for 1 year.</small>
          </div>
        )}
      </div>
    </div>
  );

  // Edit Plan View
  const renderEditPlanView = () => (
    <div>
      <h2>Edit Transfer Plan</h2>
      
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}>
          <strong>Editing Plan:</strong> {loadedPlan?.plan_name} (Code: {loadedPlan?.code})
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Plan Name:</label>
          <input
            type="text"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="Enter a name for your transfer plan"
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Source Institution:</label>
            <select
              value={sourceInstitution}
              onChange={(e) => setSourceInstitution(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <option value="">Select source institution</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Target Institution:</label>
            <select
              value={targetInstitution}
              onChange={(e) => setTargetInstitution(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <option value="">Select target institution</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <strong>Selected Courses ({selectedCourses.length}):</strong>
          {selectedCourses.length > 0 ? (
            <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', borderRadius: '4px' }}>
              {selectedCourses.map((course, index) => (
                <div key={course.id} style={{ padding: '5px', borderBottom: '1px solid #f0f0f0' }}>
                  <span>{course.code}: {course.title}</span>
                  <button
                    onClick={() => toggleCourseSelection(course)}
                    style={{
                      marginLeft: '10px',
                      padding: '2px 6px',
                      fontSize: '12px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ marginTop: '10px', fontStyle: 'italic', color: '#666' }}>
              No courses selected. Go to "Browse Courses" to add courses to your plan.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={updatePlan}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Update Plan
          </button>
          <button
            onClick={cancelEdit}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={deletePlan}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Delete Plan
          </button>
        </div>
      </div>
    </div>
  );

  // View Plan View
  const renderViewPlanView = () => (
    <div>
      <h2>Transfer Plan Details</h2>
      
      {loadedPlan && (
        <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>{loadedPlan.plan_name}</h3>
            <p style={{ margin: '5px 0', color: '#666' }}>
              <strong>Plan Code:</strong> 
              <span style={{ fontFamily: 'monospace', backgroundColor: '#fff', padding: '3px 6px', marginLeft: '8px', border: '1px solid #ddd', borderRadius: '3px' }}>
                {loadedPlan.code}
              </span>
            </p>
            <p style={{ margin: '5px 0', color: '#666' }}>
              <strong>Created:</strong> {new Date(loadedPlan.created_at).toLocaleDateString()}
            </p>
            <p style={{ margin: '5px 0', color: '#666' }}>
              <strong>Transfer Path:</strong> {loadedPlan.source_institution} → {loadedPlan.target_institution}
            </p>
          </div>

          <h4>Selected Courses ({loadedPlan.selected_courses.length})</h4>
          
          {loadedPlan.selected_courses.length > 0 ? (
            <div style={{ display: 'grid', gap: '15px' }}>
              {loadedPlan.selected_courses.map((course, index) => (
                <div key={course.id} style={{ 
                  padding: '15px', 
                  border: '1px solid #e0e0e0', 
                  borderRadius: '6px',
                  backgroundColor: '#fafafa'
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong style={{ fontSize: '16px', color: '#333' }}>
                      {course.code}: {course.title}
                    </strong>
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {course.institution_name} - {course.department_name}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontStyle: 'italic', color: '#666' }}>No courses in this plan.</p>
          )}

          <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                setLoadedPlan(null);
                setSearchCode('');
                setCurrentView('browse');
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Back to Browse
            </button>
            <button
              onClick={startEditMode}
              style={{
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Edit Plan
            </button>
            <button
              onClick={deletePlan}
              style={{
                padding: '10px 20px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Delete Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: '#333', borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>
        Course Equivalency Finder
      </h1>

      {/* CSV Import Section */}
      <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#495057' }}>Import Course Data</h3>
        <form onSubmit={handleImport} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input 
            type="file" 
            name="file" 
            accept=".csv" 
            style={{ flex: 1 }}
          />
          <button 
            type="submit"
            style={{
              padding: '8px 16px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Import CSV
          </button>
        </form>
        <small style={{ color: '#6c757d', marginTop: '5px', display: 'block' }}>
          Upload a CSV file with course equivalencies to populate the database.
        </small>
      </div>

      {/* Navigation */}
      {renderNavigation()}

      {/* Content based on current view */}
      {currentView === 'browse' && renderBrowseView()}
      {currentView === 'create-plan' && renderCreatePlanView()}
      {currentView === 'view-plan' && renderViewPlanView()}
      {currentView === 'edit-plan' && renderEditPlanView()}
    </div>
  );
}

export default App;