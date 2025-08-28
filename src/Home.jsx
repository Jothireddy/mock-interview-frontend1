import React from 'react';
import MockInterviewStudio from './Practice_Interview';
import AdminPanel from './Admin';

export default function Home({ navigateTo }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#f4f4f9'
    }}>
      <h1 style={{ fontSize: '3rem', color: '#333', marginBottom: '40px' }}>
        AI Interview Studio
      </h1>
      <div style={{ display: 'flex', gap: '20px' }}>
        <button 
          onClick={() => navigateTo('admin')}
          style={{
            padding: '15px 30px',
            fontSize: '1.2rem',
            cursor: 'pointer',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '8px'
          }}
        >
          Create Custom Interview
        </button>
        <button 
          onClick={() => navigateTo('practice')}
          style={{
            padding: '15px 30px',
            fontSize: '1.2rem',
            cursor: 'pointer',
            backgroundColor: '#2ecc71',
            color: '#fff',
            border: 'none',
            borderRadius: '8px'
          }}
        >
          Start Quick Practice
        </button>
      </div>
    </div>
  );
}