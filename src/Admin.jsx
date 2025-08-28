/*import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';

const BACKEND_HTTP = process.env.REACT_APP_ADMIN_BACKEND_HTTP || 'http://localhost:3002';
const BACKEND_WS = process.env.REACT_APP_ADMIN_BACKEND_WS || 'ws://localhost:3002/ws';


function IconLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" opacity="0.12" />
      <path d="M8 12h8M8 8h8M8 16h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AiAvatar({ small }) {
  return (
    <div className={`flex items-center justify-center ${small ? 'w-10 h-10' : 'w-16 h-16'}`}>
      <svg viewBox="0 0 24 24" fill="none" className={`${small ? 'w-8 h-8' : 'w-14 h-14'}`}>
        <circle cx="12" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5 19c1.8-4 6-6 7-6s5.2 2 7 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const PrimaryButton = ({ children, onClick, className = '', disabled = false }) => (
  <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-semibold shadow-md transition ${disabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:opacity-95'} ${className}`}>
    {children}
  </button>
);

export default function App1() {
  const [page, setPage] = useState('admin');
  const [interviewId, setInterviewId] = useState(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/interview/')) {
      const id = path.split('/')[2];
      if (id) {
        setInterviewId(id);
        setPage('candidate');
      }
    } else {
      if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
      setPage('admin');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50 text-gray-900 font-sans">
      <TopNav onGoHome={() => { setPage('admin'); window.history.replaceState({}, '', '/'); }} />
      {page === 'candidate' ? <CandidatePage interviewId={interviewId} /> : <AdminPanel onGoCandidate={(id) => { setInterviewId(id); setPage('candidate'); window.history.pushState({}, '', `/interview/${id}`); }} />}
      <footer className="text-center text-xs text-gray-400 py-6">© MockInterviewStudio • Built with ❤️ — keep user privacy in mind</footer>
    </div>
  );
}

function TopNav({ onGoHome }) {
  return (
    <header className="max-w-6xl mx-auto p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="rounded-xl bg-gradient-to-br from-black to-gray-800 text-white w-12 h-12 flex items-center justify-center shadow-md cursor-pointer" onClick={onGoHome}>
          <IconLogo />
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">MockInterviewStudio</h1>
          <div className="text-xs text-gray-500">Resilient, production-ready mock interview UI</div>
        </div>
      </div>
      <nav className="flex items-center gap-4">
        <a className="text-sm text-gray-600 hover:text-black">Docs</a>
        <a className="text-sm text-gray-600 hover:text-black">Support</a>
        <button className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white shadow">Sign in</button>
      </nav>
    </header>
  );
}

function AdminPanel({ onGoCandidate }) {
  const [mode, setMode] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  const handleGenerateQuestions = async () => {
    if (!jobDescription) return alert('Please enter a job description.');
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_HTTP}/generate-questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobDescription }) });
      const data = await res.json();
      if (res.ok) setQuestions(data.questions || []);
      else throw new Error(data.error || 'Generation failed');
    } catch (error) {
      alert(`Error generating questions: ${error.message}`);
    }
    setIsLoading(false);
  };

  const handleCreateInterview = async () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append('jobDescription', jobDescription);
    formData.append('requiresResumeUpload', mode === 'without-resume');
    if (mode === 'with-resume' && resumeFile) formData.append('resume', resumeFile);
    if (mode === 'without-resume' && questions.length > 0) formData.append('questions', JSON.stringify(questions));

    try {
      const res = await fetch(`${BACKEND_HTTP}/create-interview`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setGeneratedLink(data.interviewLink);
        // Optionally open candidate view immediately in the same app
        if (onGoCandidate && data.interviewId) onGoCandidate(data.interviewId);
      } else throw new Error(data.error || 'Create failed');
    } catch (error) {
      alert(`Error creating interview: ${error.message}`);
    }
    setIsLoading(false);
  };

  const handleQuestionChange = (index, value) => {
    const newQuestions = [...questions];
    newQuestions[index] = value;
    setQuestions(newQuestions);
  };

  const handleRemoveQuestion = (index) => setQuestions(questions.filter((_, i) => i !== index));
  const handleAddQuestion = () => setQuestions([...questions, '']);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-md border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Create Interview</h2>
              <p className="text-sm text-gray-500">Choose a creation mode and provide job details</p>
            </div>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => setMode('with-resume')}>With Resume</PrimaryButton>
              <PrimaryButton onClick={() => setMode('without-resume')}>Without Resume</PrimaryButton>
            </div>
          </div>

          {!mode ? (
            <div className="py-12 text-center text-gray-500">Select a mode to begin creating an interview</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">Mode:</div>
                <div className="text-sm font-medium">{mode === 'with-resume' ? 'Admin-provided resume' : 'Pre-generated questions'}</div>
              </div>

              {mode === 'with-resume' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Upload Resume (optional)</label>
                  <input type="file" accept=".pdf,.txt" onChange={(e) => setResumeFile(e.target.files[0])} className="mt-2 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-gray-100 hover:file:bg-gray-200" />
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700">Job Description</label>
                <textarea rows="8" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description here..." className="mt-2 w-full p-4 border border-gray-200 rounded-lg text-sm shadow-sm" />
              </div>

              {mode === 'without-resume' && (
                <div>
                  <div className="flex items-center gap-3">
                    <PrimaryButton onClick={handleGenerateQuestions} disabled={isLoading}>{isLoading ? 'Generating…' : 'Generate 15 Questions'}</PrimaryButton>
                    <button onClick={handleAddQuestion} className="text-sm text-blue-600 hover:text-blue-800">+ Add blank question</button>
                  </div>

                  {questions.length > 0 && (
                    <div className="mt-4 bg-gray-50 p-4 rounded-lg border max-h-80 overflow-y-auto">
                      {questions.map((q, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2">
                          <div className="text-sm text-gray-500 w-6">{i + 1}.</div>
                          <input type="text" value={q} onChange={(e) => handleQuestionChange(i, e.target.value)} className="flex-1 p-2 border rounded text-sm" />
                          <button onClick={() => handleRemoveQuestion(i)} className="text-red-500 px-2">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t flex items-center justify-between">
                {generatedLink ? (
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-green-700">Link created</div>
                    <input className="p-2 text-sm border rounded" readOnly value={generatedLink} />
                    <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={() => navigator.clipboard.writeText(generatedLink)}>Copy</button>
                  </div>
                ) : (
                  <PrimaryButton onClick={handleCreateInterview} disabled={isLoading || (mode === 'without-resume' && questions.length === 0)}>
                    {isLoading ? 'Creating…' : 'Approve & Create Interview Link'}
                  </PrimaryButton>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="bg-white rounded-2xl p-6 shadow-md border">
          <h3 className="text-lg font-semibold">Quick Actions</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">📄</div>
              <div>
                <div className="text-sm font-medium">Manage Templates</div>
                <div className="text-xs text-gray-500">Save job templates for reuse</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">🔗</div>
              <div>
                <div className="text-sm font-medium">Active Links</div>
                <div className="text-xs text-gray-500">See current interviews & expiry</div>
              </div>
            </div>

            <div className="pt-3">
              <div className="text-xs text-gray-500">Tips</div>
              <ul className="text-xs text-gray-600 mt-2 list-disc ml-4">
                <li>Use pre-generated questions to speed up creation.</li>
                <li>Choose Entire screen when candidates share their screen.</li>
              </ul>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function CandidatePage({ interviewId }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [interviewState, setInterviewState] = useState('loading');
  const candidateTokenRef = useRef(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${BACKEND_HTTP}/get-interview-config/${interviewId}`);
        if (!res.ok) throw new Error('Interview not found or has expired.');
        const data = await res.json();
        setConfig(data);
        setInterviewState(data.status === 'COMPLETED' ? 'completed' : 'welcome');
      } catch (err) {
        setError(err.message);
        setInterviewState('error');
      }
    };
    fetchConfig();
  }, [interviewId]);

  const handleResumeUpload = async () => {
    if (!resumeFile) return alert('Please select a resume file.');
    setIsUploading(true);
    const formData = new FormData();
    formData.append('resume', resumeFile);
    try {
      const res = await fetch(`${BACKEND_HTTP}/upload-candidate-resume/${interviewId}`, { method: 'POST', body: formData });
      if (res.ok) setConfig(prev => ({ ...prev, requiresResumeUpload: false }));
      else throw new Error((await res.json()).error || 'Upload failed');
    } catch (err) { alert(`Upload failed: ${err.message}`); }
    setIsUploading(false);
  };

  const startInterviewFlow = async () => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/get-candidate-token/${interviewId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not authorize interview session.');
      const { token } = await res.json();
      candidateTokenRef.current = token;
      setInterviewState('in_progress');
    } catch (err) {
      setError(err.message);
      setInterviewState('error');
    }
  };

  if (interviewState === 'loading') return <CenteredCard title="Loading…" subtitle="Fetching interview details" />;
  if (interviewState === 'error') return <CenteredCard title="Error" subtitle={error} tone="red" />;
  if (interviewState === 'completed') return <CenteredCard title="Interview Completed" subtitle="Thank you for your time." tone="green" />;
  if (interviewState === 'in_progress') return <InterviewRoom interviewId={interviewId} token={candidateTokenRef.current} onInterviewEnd={() => setInterviewState('completed')} />;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="bg-gray-800 text-white p-10 rounded-2xl shadow-2xl max-w-2xl w-full">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-lg shadow">
            <AiAvatar small />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Welcome to Your Interview</h2>
            <div className="text-sm text-gray-300">Please follow the instructions below to continue</div>
          </div>
        </div>

        <div className="bg-gray-900 p-4 rounded-lg mb-4 border border-gray-700 max-h-40 overflow-y-auto">
          <p className="text-sm whitespace-pre-wrap">{config.jobDescription}</p>
        </div>

        {config.requiresResumeUpload ? (
          <div className="space-y-4">
            <p className="font-semibold text-gray-200">Action required: upload your resume</p>
            <input type="file" accept=".pdf,.txt" onChange={(e) => setResumeFile(e.target.files[0])} className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            <div className="flex gap-3">
              <PrimaryButton onClick={handleResumeUpload} disabled={isUploading || !resumeFile}>{isUploading ? 'Uploading…' : 'Upload & Continue'}</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <PrimaryButton onClick={startInterviewFlow}>Start Interview</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ title, subtitle, tone = 'neutral' }) {
  const toneBg = tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'green' ? 'bg-green-50 text-green-700' : 'bg-white text-gray-900';
  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${tone === 'neutral' ? 'bg-gray-50' : 'bg-white'}`}>
      <div className={`rounded-2xl p-10 shadow-md max-w-xl w-full ${toneBg}`}>
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>
    </div>
  );
}

function InterviewRoom({ interviewId, token, onInterviewEnd }) {
  const [status, setStatus] = useState('initializing...');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Detecting...');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]);

  const wsRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const userVideoRef = useRef(null);
  const cameraRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!token) return setStatus('Error: No auth token provided.');

    let isMounted = true;
    let localStream = null;
    let localAudioContext = null;
    let localCamera = null;
    let localWs = null;

    const setup = async () => {
      try {
        setStatus('Requesting camera & mic…');
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
        if (!isMounted) return;
        mediaStreamRef.current = localStream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = localStream;
          await userVideoRef.current.play().catch(() => {});
        }

        setStatus('Connecting to AI…');
        localWs = new WebSocket(`${BACKEND_WS}?interviewId=${interviewId}&token=${token}`);
        wsRef.current = localWs;

        localWs.onopen = () => { if (!isMounted) return; setStatus('Recording'); };

        localWs.onmessage = (ev) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'llm_feedback' && data.audio) {
              if (audioPlayerRef.current) audioPlayerRef.current.pause();
              const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
              setIsAiSpeaking(true);
              setStatus('AI is speaking...');
              audio.play();
              audio.onended = () => { setIsAiSpeaking(false); setStatus('Recording'); };
              audioPlayerRef.current = audio;
            }
            if (data.type === 'transcript_chunk' && data.text) {
              setTranscript((t) => [...t, data.text]);
            }
          } catch (e) { }
        };

        localWs.onclose = () => { if (!isMounted) return; setStatus('Interview ended.'); onInterviewEnd && onInterviewEnd(); };
        localWs.onerror = () => { if (!isMounted) return; setStatus('Connection error.'); };

        // Audio processing
        localAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = localAudioContext;
        const source = localAudioContext.createMediaStreamSource(localStream);
        const processor = localAudioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const float32Array = e.inputBuffer.getChannelData(0);
          // convert to int16
          const l = float32Array.length;
          const int16 = new Int16Array(l);
          for (let i = 0; i < l; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          }
          if (localWs && localWs.readyState === WebSocket.OPEN) localWs.send(int16.buffer);
        };
        source.connect(processor);
        try { processor.connect(localAudioContext.destination); } catch (e) {}

        // Face tracking
        const fm = new faceMesh.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
        fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        fm.onResults((results) => {
          if (!isMounted) return;
          if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) setFaceStatus('No face');
          else {
            const landmarks = results.multiFaceLandmarks[0];
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            const nose = landmarks[1];
            const eyeCenterX = (leftEye.x + rightEye.x) / 2;
            setFaceStatus(Math.abs(eyeCenterX - nose.x) < 0.035 ? 'Eye contact ✅' : 'Looking away');
          }
        });

        localCamera = new cam.Camera(userVideoRef.current, { onFrame: async () => { if (userVideoRef.current) await fm.send({ image: userVideoRef.current }); }, width: 1280, height: 720 });
        localCamera.start();
        cameraRef.current = localCamera;

        setIsRecording(true);
      } catch (err) {
        console.error(err);
        setStatus('Error accessing devices or connecting');
      }
    };

    setup();

    return () => {
      isMounted = false;
      setIsRecording(false);
      if (cameraRef.current) cameraRef.current.stop();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      if (localAudioContext && localAudioContext.state !== 'closed') localAudioContext.close();
      if (localWs && localWs.readyState === WebSocket.OPEN) localWs.close();
      cameraRef.current = null; mediaStreamRef.current = null; audioContextRef.current = null; wsRef.current = null;
    };
  }, [interviewId, token, onInterviewEnd]);

  const handleEndInterview = async () => {
    try { if (wsRef.current) wsRef.current.close(); } catch (e) {}
  };

  return (
    <div className="min-h-screen p-6 flex flex-col items-center">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-black/70 to-gray-900 rounded-2xl overflow-hidden shadow-lg border-2 border-gray-800">
          <div className="relative aspect-video bg-black">
            <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />

            <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-sm backdrop-blur-sm border ${isAiSpeaking ? 'bg-green-600/80 border-green-500' : 'bg-black/60 border-gray-700'}`}>
              {isAiSpeaking ? 'AI is speaking' : status}
            </div>

            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-3">
              <div className="bg-white/10 p-3 rounded-full"><AiAvatar small /></div>
              <div>
                <div className="text-sm font-semibold">AI Interviewer</div>
                <div className="text-xs text-gray-300">{faceStatus}</div>
              </div>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between bg-gray-900 border-t border-gray-800">
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${isRecording ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200'}`}>{isRecording ? 'REC' : 'Idle'}</div>
              <div className="text-sm text-gray-300">Session: <span className="font-mono text-gray-200 ml-2">{interviewId || '—'}</span></div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleEndInterview} className="px-4 py-2 rounded-full bg-red-600 text-white shadow hover:bg-red-700">End Interview</button>
            </div>
          </div>
        </div>

        <aside className="bg-white rounded-2xl p-4 shadow-md border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-lg font-semibold">Controls</h4>
              <div className="text-xs text-gray-500">Live controls & transcript</div>
            </div>
            <div className="text-xs text-gray-400">{isRecording ? 'Live' : 'Stopped'}</div>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Transcript</div>
              <div className="mt-2 max-h-40 overflow-y-auto text-sm text-gray-700 leading-relaxed">{transcript.length === 0 ? <span className="text-gray-400">No speech captured yet.</span> : transcript.map((t, i) => <div key={i} className="mb-1">{t}</div>)}</div>
            </div>

            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Notes</div>
              <textarea className="w-full mt-2 p-2 text-sm rounded border" rows={4} placeholder="Type your observation notes here..." />
            </div>

            <div>
              <button onClick={onInterviewEnd} className="w-full px-4 py-2 rounded-full bg-green-600 text-white">Finish & Submit</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}





*/

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';

const BACKEND_HTTP = process.env.REACT_APP_ADMIN_BACKEND_HTTP || 'https://rigal.in/api';
const BACKEND_WS = process.env.REACT_APP_ADMIN_BACKEND_WS || 'wss://rigal.in/ws';


function IconLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" opacity="0.12" />
      <path d="M8 12h8M8 8h8M8 16h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AiAvatar({ small }) {
  return (
    <div className={`flex items-center justify-center ${small ? 'w-10 h-10' : 'w-16 h-16'}`}>
      <svg viewBox="0 0 24 24" fill="none" className={`${small ? 'w-8 h-8' : 'w-14 h-14'}`}>
        <circle cx="12" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5 19c1.8-4 6-6 7-6s5.2 2 7 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const PrimaryButton = ({ children, onClick, className = '', disabled = false }) => (
  <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-semibold shadow-md transition ${disabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:opacity-95'} ${className}`}>
    {children}
  </button>
);

export default function App1() {
  const [page, setPage] = useState('admin');
  const [interviewId, setInterviewId] = useState(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/interview/')) {
      const id = path.split('/')[2];
      if (id) {
        setInterviewId(id);
        setPage('candidate');
      } else {
        setPage('admin');
        if (window.location.pathname !== '/') window.history.replaceState({}, '', '/');
      }
    } else {
      setPage('admin');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50 text-gray-900 font-sans">
      <TopNav onGoHome={() => { setPage('admin'); setInterviewId(null); window.history.pushState({}, '', '/'); }} />
      {page === 'candidate' ? <CandidatePage interviewId={interviewId} /> : <AdminPanel />}
      <footer className="text-center text-xs text-gray-400 py-6">© MockInterviewStudio • Built with ❤️ — keep user privacy in mind</footer>
    </div>
  );
}

// --- MODIFIED COMPONENT ---
function TopNav({ onGoHome }) {
  return (
    <header className="max-w-6xl mx-auto p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="rounded-xl bg-gradient-to-br from-black to-gray-800 text-white w-12 h-12 flex items-center justify-center shadow-md cursor-pointer" onClick={onGoHome}>
          <IconLogo />
        </div>
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">MockInterviewStudio</h1>
          {/* New, more descriptive subtitle */}
          <div className="text-xs text-gray-500">Create and manage AI-powered candidate interviews.</div>
        </div>
      </div>
      {/* The navigation bar with Docs, Support, and Sign in has been removed */}
    </header>
  );
}

function AdminPanel() {
  const [mode, setMode] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  const handleGenerateQuestions = async () => {
    if (!jobDescription) return alert('Please enter a job description.');
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_HTTP}/generate-questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobDescription }) });
      const data = await res.json();
      if (res.ok) setQuestions(data.questions || []);
      else throw new Error(data.error || 'Generation failed');
    } catch (error) {
      alert(`Error generating questions: ${error.message}`);
    }
    setIsLoading(false);
  };

  const handleCreateInterview = async () => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append('jobDescription', jobDescription);
    formData.append('requiresResumeUpload', mode === 'without-resume');
    if (mode === 'with-resume' && resumeFile) formData.append('resume', resumeFile);
    if (mode === 'without-resume' && questions.length > 0) formData.append('questions', JSON.stringify(questions));

    try {
      const res = await fetch(`${BACKEND_HTTP}/create-interview`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setGeneratedLink(data.interviewLink);
      } else throw new Error(data.error || 'Create failed');
    } catch (error) {
      alert(`Error creating interview: ${error.message}`);
    }
    setIsLoading(false);
  };

  const handleQuestionChange = (index, value) => {
    const newQuestions = [...questions];
    newQuestions[index] = value;
    setQuestions(newQuestions);
  };

  const handleRemoveQuestion = (index) => setQuestions(questions.filter((_, i) => i !== index));
  const handleAddQuestion = () => setQuestions([...questions, '']);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-md border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Create Interview</h2>
              <p className="text-sm text-gray-500">Choose a creation mode and provide job details</p>
            </div>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => setMode('with-resume')}>With Resume</PrimaryButton>
              <PrimaryButton onClick={() => setMode('without-resume')}>Without Resume</PrimaryButton>
            </div>
          </div>

          {!mode ? (
            <div className="py-12 text-center text-gray-500">Select a mode to begin creating an interview</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">Mode:</div>
                <div className="text-sm font-medium">{mode === 'with-resume' ? 'Admin-provided resume' : 'Pre-generated questions'}</div>
              </div>

              {mode === 'with-resume' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Upload Resume (optional)</label>
                  <input type="file" accept=".pdf,.txt" onChange={(e) => setResumeFile(e.target.files[0])} className="mt-2 w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-gray-100 hover:file:bg-gray-200" />
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700">Job Description</label>
                <textarea rows="8" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description here..." className="mt-2 w-full p-4 border border-gray-200 rounded-lg text-sm shadow-sm" />
              </div>

              {mode === 'without-resume' && (
                <div>
                  <div className="flex items-center gap-3">
                    <PrimaryButton onClick={handleGenerateQuestions} disabled={isLoading}>{isLoading ? 'Generating…' : 'Generate 15 Questions'}</PrimaryButton>
                    <button onClick={handleAddQuestion} className="text-sm text-blue-600 hover:text-blue-800">+ Add blank question</button>
                  </div>

                  {questions.length > 0 && (
                    <div className="mt-4 bg-gray-50 p-4 rounded-lg border max-h-80 overflow-y-auto">
                      {questions.map((q, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2">
                          <div className="text-sm text-gray-500 w-6">{i + 1}.</div>
                          <input type="text" value={q} onChange={(e) => handleQuestionChange(i, e.target.value)} className="flex-1 p-2 border rounded text-sm" />
                          <button onClick={() => handleRemoveQuestion(i)} className="text-red-500 px-2">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t flex items-center justify-between">
                {generatedLink ? (
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-green-700">Link created</div>
                    <input className="p-2 text-sm border rounded" readOnly value={generatedLink} />
                    <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={() => navigator.clipboard.writeText(generatedLink)}>Copy</button>
                  </div>
                ) : (
                  <PrimaryButton onClick={handleCreateInterview} disabled={isLoading || (mode === 'without-resume' && questions.length === 0)}>
                    {isLoading ? 'Creating…' : 'Approve & Create Interview Link'}
                  </PrimaryButton>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="bg-white rounded-2xl p-6 shadow-md border">
          <h3 className="text-lg font-semibold">Quick Actions</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">📄</div>
              <div>
                <div className="text-sm font-medium">Manage Templates</div>
                <div className="text-xs text-gray-500">Save job templates for reuse</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">🔗</div>
              <div>
                <div className="text-sm font-medium">Active Links</div>
                <div className="text-xs text-gray-500">See current interviews & expiry</div>
              </div>
            </div>

            <div className="pt-3">
              <div className="text-xs text-gray-500">Tips</div>
              <ul className="text-xs text-gray-600 mt-2 list-disc ml-4">
                <li>Use pre-generated questions to speed up creation.</li>
                <li>Choose Entire screen when candidates share their screen.</li>
              </ul>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function CandidatePage({ interviewId }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [interviewState, setInterviewState] = useState('loading');
  const candidateTokenRef = useRef(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${BACKEND_HTTP}/get-interview-config/${interviewId}`);
        if (!res.ok) throw new Error('Interview not found or has expired.');
        const data = await res.json();
        setConfig(data);
        setInterviewState(data.status === 'COMPLETED' ? 'completed' : 'welcome');
      } catch (err) {
        setError(err.message);
        setInterviewState('error');
      }
    };
    fetchConfig();
  }, [interviewId]);

  const handleResumeUpload = async () => {
    if (!resumeFile) return alert('Please select a resume file.');
    setIsUploading(true);
    const formData = new FormData();
    formData.append('resume', resumeFile);
    try {
      const res = await fetch(`${BACKEND_HTTP}/upload-candidate-resume/${interviewId}`, { method: 'POST', body: formData });
      if (res.ok) setConfig(prev => ({ ...prev, requiresResumeUpload: false }));
      else throw new Error((await res.json()).error || 'Upload failed');
    } catch (err) { alert(`Upload failed: ${err.message}`); }
    setIsUploading(false);
  };

  const startInterviewFlow = async () => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/get-candidate-token/${interviewId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not authorize interview session.');
      const { token } = await res.json();
      candidateTokenRef.current = token;
      setInterviewState('in_progress');
    } catch (err) {
      setError(err.message);
      setInterviewState('error');
    }
  };

  if (interviewState === 'loading') return <CenteredCard title="Loading…" subtitle="Fetching interview details" />;
  if (interviewState === 'error') return <CenteredCard title="Error" subtitle={error} tone="red" />;
  if (interviewState === 'completed') return <CenteredCard title="Interview Completed" subtitle="Thank you for your time." tone="green" />;
  if (interviewState === 'in_progress') return <InterviewRoom interviewId={interviewId} token={candidateTokenRef.current} onInterviewEnd={() => setInterviewState('completed')} />;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="bg-gray-800 text-white p-10 rounded-2xl shadow-2xl max-w-2xl w-full">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-lg shadow">
            <AiAvatar small />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Welcome to Your Interview</h2>
            <div className="text-sm text-gray-300">Please follow the instructions below to continue</div>
          </div>
        </div>

        <div className="bg-gray-900 p-4 rounded-lg mb-4 border border-gray-700 max-h-40 overflow-y-auto">
          <p className="text-sm whitespace-pre-wrap">{config.jobDescription}</p>
        </div>

        {config.requiresResumeUpload ? (
          <div className="space-y-4">
            <p className="font-semibold text-gray-200">Action required: upload your resume</p>
            <input type="file" accept=".pdf,.txt" onChange={(e) => setResumeFile(e.target.files[0])} className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            <div className="flex gap-3">
              <PrimaryButton onClick={handleResumeUpload} disabled={isUploading || !resumeFile}>{isUploading ? 'Uploading…' : 'Upload & Continue'}</PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <PrimaryButton onClick={startInterviewFlow}>Start Interview</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ title, subtitle, tone = 'neutral' }) {
  const toneBg = tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'green' ? 'bg-green-50 text-green-700' : 'bg-white text-gray-900';
  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${tone === 'neutral' ? 'bg-gray-50' : 'bg-white'}`}>
      <div className={`rounded-2xl p-10 shadow-md max-w-xl w-full ${toneBg}`}>
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>
    </div>
  );
}

function InterviewRoom({ interviewId, token, onInterviewEnd }) {
  const [status, setStatus] = useState('initializing...');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Detecting...');
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState([]);

  const wsRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const userVideoRef = useRef(null);
  const cameraRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!token) return setStatus('Error: No auth token provided.');

    let isMounted = true;
    let localStream = null;
    let localAudioContext = null;
    let localCamera = null;
    let localWs = null;

    const setup = async () => {
      try {
        setStatus('Requesting camera & mic…');
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
        if (!isMounted) return;
        mediaStreamRef.current = localStream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = localStream;
          await userVideoRef.current.play().catch(() => {});
        }

        setStatus('Connecting to AI…');
        localWs = new WebSocket(`${BACKEND_WS}?interviewId=${interviewId}&token=${token}`);
        wsRef.current = localWs;

        localWs.onopen = () => { if (!isMounted) return; setStatus('Recording'); };

        localWs.onmessage = (ev) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'llm_feedback' && data.audio) {
              if (audioPlayerRef.current) audioPlayerRef.current.pause();
              const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
              setIsAiSpeaking(true);
              setStatus('AI is speaking...');
              audio.play();
              audio.onended = () => { setIsAiSpeaking(false); setStatus('Recording'); };
              audioPlayerRef.current = audio;
            }
            if (data.type === 'transcript_chunk' && data.text) {
              setTranscript((t) => [...t, data.text]);
            }
          } catch (e) { }
        };

        localWs.onclose = () => { if (!isMounted) return; setStatus('Interview ended.'); onInterviewEnd && onInterviewEnd(); };
        localWs.onerror = () => { if (!isMounted) return; setStatus('Connection error.'); };

        // Audio processing
        localAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = localAudioContext;
        const source = localAudioContext.createMediaStreamSource(localStream);
        const processor = localAudioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const float32Array = e.inputBuffer.getChannelData(0);
          // convert to int16
          const l = float32Array.length;
          const int16 = new Int16Array(l);
          for (let i = 0; i < l; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          }
          if (localWs && localWs.readyState === WebSocket.OPEN) localWs.send(int16.buffer);
        };
        source.connect(processor);
        try { processor.connect(localAudioContext.destination); } catch (e) {}

        // Face tracking
        const fm = new faceMesh.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
        fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        fm.onResults((results) => {
          if (!isMounted) return;
          if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) setFaceStatus('No face');
          else {
            const landmarks = results.multiFaceLandmarks[0];
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            const nose = landmarks[1];
            const eyeCenterX = (leftEye.x + rightEye.x) / 2;
            setFaceStatus(Math.abs(eyeCenterX - nose.x) < 0.035 ? 'Eye contact ✅' : 'Looking away');
          }
        });

        localCamera = new cam.Camera(userVideoRef.current, { onFrame: async () => { if (userVideoRef.current) await fm.send({ image: userVideoRef.current }); }, width: 1280, height: 720 });
        localCamera.start();
        cameraRef.current = localCamera;

        setIsRecording(true);
      } catch (err) {
        console.error(err);
        setStatus('Error accessing devices or connecting');
      }
    };

    setup();

    return () => {
      isMounted = false;
      setIsRecording(false);
      if (cameraRef.current) cameraRef.current.stop();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      if (localAudioContext && localAudioContext.state !== 'closed') localAudioContext.close();
      if (localWs && localWs.readyState === WebSocket.OPEN) localWs.close();
      cameraRef.current = null; mediaStreamRef.current = null; audioContextRef.current = null; wsRef.current = null;
    };
  }, [interviewId, token, onInterviewEnd]);

  const handleEndInterview = async () => {
    try { if (wsRef.current) wsRef.current.close(); } catch (e) {}
  };

  return (
    <div className="min-h-screen p-6 flex flex-col items-center">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-black/70 to-gray-900 rounded-2xl overflow-hidden shadow-lg border-2 border-gray-800">
          <div className="relative aspect-video bg-black">
            <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />

            <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-sm backdrop-blur-sm border ${isAiSpeaking ? 'bg-green-600/80 border-green-500' : 'bg-black/60 border-gray-700'}`}>
              {isAiSpeaking ? 'AI is speaking' : status}
            </div>

            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-2xl p-3 flex items-center gap-3">
              <div className="bg-white/10 p-3 rounded-full"><AiAvatar small /></div>
              <div>
                <div className="text-sm font-semibold">AI Interviewer</div>
                <div className="text-xs text-gray-300">{faceStatus}</div>
              </div>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between bg-gray-900 border-t border-gray-800">
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${isRecording ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200'}`}>{isRecording ? 'REC' : 'Idle'}</div>
              <div className="text-sm text-gray-300">Session: <span className="font-mono text-gray-200 ml-2">{interviewId || '—'}</span></div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleEndInterview} className="px-4 py-2 rounded-full bg-red-600 text-white shadow hover:bg-red-700">End Interview</button>
            </div>
          </div>
        </div>

        <aside className="bg-white rounded-2xl p-4 shadow-md border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-lg font-semibold">Controls</h4>
              <div className="text-xs text-gray-500">Live controls & transcript</div>
            </div>
            <div className="text-xs text-gray-400">{isRecording ? 'Live' : 'Stopped'}</div>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Transcript</div>
              <div className="mt-2 max-h-40 overflow-y-auto text-sm text-gray-700 leading-relaxed">{transcript.length === 0 ? <span className="text-gray-400">No speech captured yet.</span> : transcript.map((t, i) => <div key={i} className="mb-1">{t}</div>)}</div>
            </div>

            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-xs text-gray-500">Notes</div>
              <textarea className="w-full mt-2 p-2 text-sm rounded border" rows={4} placeholder="Type your observation notes here..." />
            </div>

            <div>
              <button onClick={onInterviewEnd} className="w-full px-4 py-2 rounded-full bg-green-600 text-white">Finish & Submit</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}