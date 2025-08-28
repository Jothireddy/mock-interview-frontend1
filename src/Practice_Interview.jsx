/*import React, { useRef, useState, useEffect } from 'react';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';

const BACKEND_HTTP = import.meta.env.VITE_PRACTICE_BACKEND_HTTP || 'http://localhost:3001';
const BACKEND_WS = import.meta.env.VITE_PRACTICE_BACKEND_WS || 'ws://localhost:3001/ws';

function AiAvatar({ small }) {
  return (
    <div className={`flex items-center justify-center ${small ? 'w-12 h-12' : 'w-20 h-20'}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={`${small ? 'w-8 h-8' : 'w-16 h-16'}`}>
        <path d="M12,1.5A10.5,10.5,0,1,0,22.5,12,10.5,10.5,0,0,0,12,1.5Zm0,19A8.5,8.5,0,1,1,20.5,12,8.5,8.5,0,0,1,12,20.5Z" />
        <path d="M12,7.5a2,2,0,1,0,2,2A2,2,0,0,0,12,7.5Z" />
        <path d="M12,13.5a5.4,5.4,0,0,0-4.5,2.7,8.4,8.4,0,0,1,9,0A5.4,5.4,0,0,0,12,13.5Z" />
      </svg>
    </div>
  );
}

export default function MockInterviewStudio() {
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [inInterview, setInInterview] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDesc, setJobDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Detecting...');
  const [showInstructions, setShowInstructions] = useState(false);
  const [ack, setAck] = useState(false);
  const [consentRetention, setConsentRetention] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [recordingState, setRecordingState] = useState('idle'); // 'idle'|'recording'|'stopped'|'uploading'|'done'
  const [captureError, setCaptureError] = useState(null);
  const [showCaptureHelp, setShowCaptureHelp] = useState(false);

  const wsRef = useRef(null);
  const tokenRef = useRef(localStorage.getItem('mi_token') || null);
  const userRef = useRef(JSON.parse(localStorage.getItem('mi_user') || 'null'));

  // media refs
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const cameraRef = useRef(null);
  const userVideoRef = useRef(null);

  // recording refs
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const screenStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const recorderStopPromiseRef = useRef(null);

  // reconnect/backoff state
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);

  useEffect(() => {
    return () => stopInterview();
    // eslint-disable-next-line
  }, []);

  async function login(name) {
    if (!name) return false;
    try {
      const res = await fetch(`${BACKEND_HTTP}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) throw new Error('auth failed');
      const data = await res.json();
      tokenRef.current = data.token;
      userRef.current = data.user;
      localStorage.setItem('mi_token', data.token);
      localStorage.setItem('mi_user', JSON.stringify(data.user));
      setStatus('logged in');
      return true;
    } catch (err) {
      console.error('login failed', err);
      setStatus('auth error');
      return false;
    }
  }

  async function createSessionAndPrepare() {
    if (!tokenRef.current) {
      if (candidateName && candidateName.trim()) {
        setStatus('authenticating...');
        const ok = await login(candidateName.trim());
        if (!ok) return;
      } else {
        alert('Please enter your name in the Job Details section to continue.');
        return;
      }
    }

    setLoading(true);
    setStatus('creating session...');
    try {
      const form = new FormData();
      if (resumeFile) form.append('resume', resumeFile);
      form.append('jobDescText', jobDesc || '');
      form.append('retainTranscripts', consentRetention ? '1' : '0');

      const res = await fetch(`${BACKEND_HTTP}/create-session`, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${tokenRef.current}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'create-session failed');
      }
      const data = await res.json();
      if (!data.sessionId) throw new Error('no sessionId returned');

      setSessionId(data.sessionId);
      setStatus('session ready');

      try {
        await fetch(`${BACKEND_HTTP}/start-interview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ sessionId: data.sessionId })
        });
      } catch (e) {
        console.warn('start-interview call failed (non-fatal)', e);
      }

      setCountdown(5);
      const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
      await new Promise((r) => setTimeout(r, 5000));
      clearInterval(interval);
      setCountdown(0);

      setLoading(false);
      setShowInstructions(true);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setStatus('session create error');
      alert('Failed to create session. See console for details.');
    }
  }

  function openWs(sessionIdToOpen) {
    if (!sessionIdToOpen || !tokenRef.current) return;
    if (wsRef.current) try { wsRef.current.close(); } catch (e) {}

    const base = BACKEND_WS || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    const wsUrl = `${base}?sessionId=${sessionIdToOpen}&token=${encodeURIComponent(tokenRef.current)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[ws] open');
      reconnectAttemptsRef.current = 0;
      setStatus('connected');
      startMedia();
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === 'llm_processing') setStatus('AI is thinking...');
        if (data?.type === 'llm_feedback' && data.audio) playAiAudio(data.audio);
        if (data?.type === 'assembly_not_ready') console.warn('Assembly not ready on backend');
        if (data?.type === 'session_in_use') alert('Session is in use by another client');
        if (data?.type === 'forbidden') { alert('You are not allowed to connect to this session'); ws.close(); }
      } catch (e) {
        // ignore non-json messages
      }
    };

    ws.onclose = (ev) => {
      console.log('[ws] closed', ev.code, ev.reason);
      setStatus('disconnected');
      wsRef.current = null;
      if (!manualCloseRef.current && sessionId) {
        attemptReconnect();
      }
    };

    ws.onerror = (e) => {
      console.warn('[ws] error', e);
      setStatus('ws error');
    };

    wsRef.current = ws;
  }

  function attemptReconnect() {
    const attempts = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempts;
    const max = Number(process.env.REACT_APP_WS_RECONNECT_MAX || 8);
    if (attempts > max) { setStatus('reconnect failed'); return; }
    const backoff = Math.min(30000, 500 * Math.pow(2, attempts));
    setStatus(`reconnecting (attempt ${attempts})`);
    setTimeout(() => {
      if (!sessionId) return;
      openWs(sessionId);
    }, backoff);
  }

  function playAiAudio(audioBase64) {
    if (audioPlayerRef.current) try { audioPlayerRef.current.pause(); } catch (e) {}
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    setStatus('AI is speaking...');
    audio.play().catch((err) => console.warn(err));
    audio.onended = () => setStatus('recording');
    audioPlayerRef.current = audio;
  }

  async function startMedia() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatus('waiting for connection...');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
      mediaStreamRef.current = stream;
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
        try { await userVideoRef.current.play(); } catch (e) {}
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        try {
          const float32Array = e.inputBuffer.getChannelData(0);
          const int16Buffer = new Int16Array(float32Array.length);
          for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Buffer[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          }
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(int16Buffer.buffer);
          }
        } catch (err) {
          console.warn('audio processing error', err);
        }
      };

      source.connect(processor);
      try { processor.connect(audioContext.destination); } catch (e) {}

      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;

      const fm = new faceMesh.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      fm.onResults((results) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) setFaceStatus('No face detected');
        else {
          const landmarks = results.multiFaceLandmarks[0];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const nose = landmarks[1];
          const eyeCenterX = (leftEye.x + rightEye.x) / 2;
          if (Math.abs(eyeCenterX - nose.x) < 0.035) setFaceStatus('Eye contact ✅');
          else setFaceStatus('Not looking at screen');
        }
      });

      const camera = new cam.Camera(userVideoRef.current, {
        onFrame: async () => {
          try { await fm.send({ image: userVideoRef.current }); } catch (e) {}
        },
        width: 1280, height: 720
      });
      camera.start();
      cameraRef.current = camera;

      setStatus('recording');
    } catch (err) {
      console.error('startMedia error', err);
      setStatus('error accessing devices');
      alert('Unable to access camera/microphone. Please check permissions.');
    }
  }

  async function requestFullscreenAndCaptureStrict() {
    setCaptureError(null);
    setShowCaptureHelp(false);

    const el = document.documentElement || document.body;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.mozRequestFullScreen) await el.mozRequestFullScreen();
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      console.warn('fullscreen request failed', e);
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false
      });

      const vt = (displayStream.getVideoTracks && displayStream.getVideoTracks()[0]) || null;
      const settings = (vt && vt.getSettings) ? vt.getSettings() : {};
      const displaySurface = settings.displaySurface || settings.surface || null;

      if (displaySurface && displaySurface !== 'monitor') {
        try { displayStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        const msg = 'Please choose "Entire screen" (or "Your entire screen") in the screen-share dialog. App will only accept Entire screen.';
        setCaptureError({ name: 'WrongSelection', message: msg, raw: `selected:${displaySurface}` });
        setShowCaptureHelp(true);
        throw new Error(msg);
      }

      if (!displaySurface && vt && vt.label) {
        const labelLower = vt.label.toLowerCase();
        if (labelLower.includes('window') || labelLower.includes('tab')) {
          try { displayStream.getTracks().forEach(t => t.stop()); } catch (e) {}
          const msg = 'It looks like a window/tab was selected. Please re-open the picker and choose "Entire screen".';
          setCaptureError({ name: 'LikelyWrongSelection', message: msg, raw: `label:${vt.label}` });
          setShowCaptureHelp(true);
          throw new Error(msg);
        }
      }

      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn('Mic denied/unavailable; continuing without mic audio');
      }

      const tracks = [];
      if (displayStream.getVideoTracks().length) tracks.push(...displayStream.getVideoTracks());
      if (micStream && micStream.getAudioTracks().length) tracks.push(...micStream.getAudioTracks());
      if (displayStream.getAudioTracks && displayStream.getAudioTracks().length) tracks.push(...displayStream.getAudioTracks());

      const combined = new MediaStream(tracks);
      screenStreamRef.current = displayStream;
      micStreamRef.current = micStream;

      let mimeType = '';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mimeType = 'video/webm;codecs=vp9';
      else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mimeType = 'video/webm;codecs=vp8';
      else mimeType = 'video/webm';

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(combined, { mimeType });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstart = () => {
        setRecordingState('recording');
        console.log('screen recording started (ENTIRE SCREEN)');
      };
      recorder.onstop = () => {
        setRecordingState('stopped');
        console.log('screen recording stopped');
        if (recorderStopPromiseRef.current) {
          recorderStopPromiseRef.current();
          recorderStopPromiseRef.current = null;
        }
      };
      recorder.onerror = (e) => {
        console.error('MediaRecorder error', e);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setCaptureError(null);
      setShowCaptureHelp(false);
      return true;
    } catch (err) {
      console.warn('requestFullscreenAndCaptureStrict failed', err);
      const name = (err && err.name) ? err.name : 'UnknownError';
      let message = 'Screen capture failed.';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        message = 'Screen sharing permission denied or blocked. When the browser prompt appears choose "Entire screen" and click Share.';
      } else if (name === 'AbortError') {
        message = 'You dismissed the screen-share dialog. Please re-open it and choose "Entire screen".';
      } else if (name === 'NotFoundError') {
        message = 'No screen/window found for sharing on this device.';
      } else if (name === 'WrongSelection' || name === 'LikelyWrongSelection') {
        message = err.message || 'Please select Entire screen.';
      } else {
        message = err.message || (`Screen capture error: ${name}`);
      }
      setCaptureError({ name, message, raw: String(err) });
      setShowCaptureHelp(true);
      throw err;
    }
  }

  async function startScreenRecording() {
    try {
      await requestFullscreenAndCaptureStrict();
    } catch (err) {
      console.warn('startScreenRecording failed', err);
    }
  }

  async function stopScreenRecordingAndUpload() {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
        await new Promise((resolve) => {
          recorderStopPromiseRef.current = resolve;
          setTimeout(() => {
            if (recorderStopPromiseRef.current) {
              recorderStopPromiseRef.current();
              recorderStopPromiseRef.current = null;
            }
            resolve();
          }, 5000);
        });
      }

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }

      const chunks = recordedChunksRef.current || [];
      if (!chunks.length) {
        setRecordingState('done');
        return null;
      }
      const blob = new Blob(chunks, { type: chunks[0].type || 'video/webm' });
      console.log('Prepared blob for upload', { size: blob.size, type: blob.type });
      setRecordingState('uploading');

      const form = new FormData();
      const filename = `${sessionId || 'anon'}_${Date.now()}.webm`;
      form.append('video', blob, filename);
      form.append('sessionId', sessionId || '');

      const res = await fetch(`${BACKEND_HTTP}/upload-interview-video`, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${tokenRef.current}` }
      });

      if (!res.ok) {
        let bodyText = await res.text().catch(() => '');
        try { bodyText = JSON.stringify(JSON.parse(bodyText)); } catch (e) {}
        console.error('video upload failed', { status: res.status, statusText: res.statusText, body: bodyText });
        setRecordingState('done');
        return null;
      }

      const data = await res.json();
      setRecordingState('done');
      return data;
    } catch (err) {
      console.error('stopScreenRecordingAndUpload failed', err);
      setRecordingState('done');
      return null;
    } finally {
      recordedChunksRef.current = [];
      recorderRef.current = null;
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    }
  }

  async function stopInterview({ endServerSide = true } = {}) {
    manualCloseRef.current = true;
    setStatus('stopping...');
    if (audioPlayerRef.current) try { audioPlayerRef.current.pause(); } catch (e) {}
    if (mediaStreamRef.current) {
      try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      mediaStreamRef.current = null;
    }
    if (cameraRef.current && cameraRef.current.stop) try { cameraRef.current.stop(); } catch (e) {}
    cameraRef.current = null;
    if (audioProcessorRef.current) try { audioProcessorRef.current.disconnect(); } catch (e) {}
    if (audioSourceRef.current) try { audioSourceRef.current.disconnect(); } catch (e) {}
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch (e) {}
    }
    audioProcessorRef.current = null;
    audioSourceRef.current = null;
    audioContextRef.current = null;

    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }

    try {
      const uploadResult = await stopScreenRecordingAndUpload();
      if (uploadResult && uploadResult.ok) {
        console.log('Interview video uploaded:', uploadResult);
        setStatus('video uploaded');
      } else {
        if (recordingState === 'idle') setStatus('no recording');
      }
    } catch (e) {
      console.warn('uploadError', e);
    }

    if (endServerSide && sessionId && tokenRef.current) {
      try {
        await fetch(`${BACKEND_HTTP}/end-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ sessionId })
        });
      } catch (e) {
        console.warn('end-session request failed', e);
      }
    }

    setSessionId(null);
    setInInterview(false);
    setStatus('idle');
    setShowInstructions(false);
    setAck(false);
    setCaptureError(null);
    setShowCaptureHelp(false);
  }

  async function handleStartInterview() {
    if (!sessionId) return;
    if (!ack) {
      alert('Please acknowledge the instructions to start.');
      return;
    }
    setShowInstructions(false);
    setInInterview(true);
    manualCloseRef.current = false;
    reconnectAttemptsRef.current = 0;

    await startScreenRecording();
    openWs(sessionId);
  }

  function renderCaptureHelp() {
    if (!showCaptureHelp || !captureError) return null;
    const e = captureError;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
        <div className="bg-white rounded-lg p-6 max-w-xl w-full">
          <h3 className="text-lg font-semibold mb-2">Screen share issue</h3>
          <p className="text-sm text-gray-700 mb-3">{e.message}</p>
          <div className="text-xs text-gray-500 mb-3">Technical: {e.name} — {String(e.raw).slice(0, 300)}</div>

          <div className="text-sm mb-4">
            <p>How to resolve:</p>
            <ol className="list-decimal ml-5 mt-2 text-sm">
              <li>When the screen-share dialog appears, choose <strong>Entire screen</strong> (or "Your entire screen") then click Share.</li>
              <li>If you dismissed the dialog, click Retry and do not close the dialog until you pick Entire screen.</li>
              <li>Disable any privacy or enterprise extensions that block screen capture (ad-blockers, privacy extensions, or DLP tools).</li>
              <li>Try an alternative browser (Chrome, Edge, Firefox up-to-date) if your current browser blocks capture.</li>
            </ol>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button onClick={() => { setShowCaptureHelp(false); setCaptureError(null); }} className="px-3 py-2 border rounded">Cancel</button>
            <button onClick={() => { setShowCaptureHelp(false); setCaptureError(null); startScreenRecording(); }} className="px-3 py-2 bg-black text-white rounded">Retry (choose Entire screen)</button>
          </div>
        </div>
      </div>
    );
  }

  const PrimaryButton = ({ children, onClick, className = '', disabled = false }) => (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-medium shadow ${disabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:opacity-95'} ${className}`}>{children}</button>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      <div className="max-w-6xl mx-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white border rounded-xl flex items-center justify-center shadow-sm">
              <AiAvatar />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Mock Interview Studio</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">Resilient, production-ready mock interview UI — white-only theme.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-400">Status</div>
              <div className="mt-1 px-3 py-2 border rounded-lg w-56 text-sm bg-gray-50 flex items-center justify-between">
                <span className="truncate">{status}{recordingState === 'recording' ? ' • REC' : ''}</span>
                <span className="ml-2 text-xs font-mono text-gray-400">{sessionId ? sessionId.slice(0,8) : null}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!inInterview && <PrimaryButton onClick={createSessionAndPrepare} disabled={loading}>{loading ? 'Preparing…' : 'Start Interview'}</PrimaryButton>}
              {inInterview && <button onClick={() => stopInterview({ endServerSide: true })} className="px-4 py-2 rounded-full bg-red-600 text-white text-sm shadow hover:opacity-95">End</button>}
            </div>
          </div>
        </header>

        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full border-8 border-gray-200 border-t-black animate-spin" />
              <div className="text-lg font-medium">Starting your interview</div>
              <div className="text-sm text-gray-500">Preparing environment…</div>
              {countdown > 0 && <div className="mt-2 text-2xl font-semibold">{countdown}</div>}
            </div>
          </div>
        )}

        {inInterview ? (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-500">Interview</div>
                  <div className="text-lg font-semibold">Live Session {sessionId ? <span className="ml-2 text-xs font-mono text-gray-400">{sessionId.slice(0,8)}</span> : null}</div>
                </div>
                <div className="text-sm text-gray-500">Status: <span className="font-medium text-gray-800">{status}</span></div>
              </div>

              <div className="flex-1 bg-gray-50 rounded-xl border overflow-hidden relative min-h-[360px]">
                <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover bg-black" style={{ transform: 'scaleX(-1)' }} />

                <div className="absolute bottom-6 left-6 bg-white/95 border rounded-2xl p-3 shadow-lg flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <AiAvatar small />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">AI Interviewer</div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">{status}</div>
                  </div>
                </div>

                <div className="absolute top-4 left-4 bg-white/90 px-3 py-1 rounded-full text-sm border">{faceStatus}</div>
              </div>

              <div className="mt-4 text-sm text-gray-500">Tip: Keep your camera at eye-level and look at the center of the screen for good eye-contact.</div>
            </div>

            <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-500">Coding Terminal</div>
                  <div className="text-lg font-semibold">Live Problem</div>
                </div>
                <div className="text-sm text-gray-500">Controls</div>
              </div>

              <div className="flex-1 bg-neutral-900 rounded-lg p-3 overflow-auto flex flex-col">
                <div className="text-xs text-gray-400 mb-2">// Write your code here</div>
                <textarea className="w-full flex-1 min-h-[240px] bg-neutral-900 text-white resize-none outline-none text-sm font-mono p-3 rounded" defaultValue={`// Sample starter\nfunction solution() {\n  // ...\n}`} />

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-gray-400">Session: <span className="font-mono text-white">{sessionId || '—'}</span></div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-2 bg-white text-black rounded-md">Run</button>
                    <button onClick={() => stopInterview({ endServerSide: true })} className="px-3 py-2 bg-red-600 text-white rounded-md">End</button>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-400">QA: The assistant will provide feedback as audio and text during the interview.</div>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-6 mt-6">
            <div className="bg-white border rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-semibold">Job Details</h2>
              <p className="text-sm text-gray-500 mt-2">Provide resume (optional) and paste the job description. Also consent to transcript retention for better feedback (optional).</p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Candidate name</div>
                  <input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Your full name" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gray-100" />
                </div>

                <div>
                  <div className="text-xs text-gray-500">Position</div>
                  <input placeholder="Job title (optional)" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gray-100" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Resume (optional)</div>
                  <input onChange={(e) => setResumeFile(e.target.files?.[0] || null)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" type="file" accept=".pdf,text/plain" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Job Description (paste here)</div>
                  <textarea value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} placeholder="Paste or type the job description — this will be used to tailor questions." className="mt-1 w-full min-h-[140px] p-3 border rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2 flex items-start gap-3">
                  <input id="consent" type="checkbox" checked={consentRetention} onChange={(e) => setConsentRetention(e.target.checked)} className="w-4 h-4 mt-1" />
                  <label htmlFor="consent" className="text-xs text-gray-700">I consent to retaining transcript & memory to improve feedback (retention policy applies)</label>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <PrimaryButton onClick={createSessionAndPrepare} disabled={loading || (!tokenRef.current && !candidateName.trim())}>Start Interview</PrimaryButton>
              </div>
            </div>
          </section>
        )}

        {showInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[720px] bg-white rounded-2xl p-6 shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <AiAvatar />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Interview Instructions</h3>
                  <p className="text-sm text-gray-600 mt-2">Welcome! A few quick instructions.</p>

                  <ul className="mt-3 text-sm text-gray-700 list-disc ml-5 space-y-2">
                    <li>Ensure your camera and mic are enabled and not used by another app.</li>
                    <li>When prompted to share your screen, <strong>choose "Entire screen"</strong> (this app only accepts Entire screen).</li>
                    <li>If your connection drops, the interviewer will resume when you reconnect (use the same browser/token).</li>
                    <li>End will remove the session from the server (irreversible).</li>
                    <li>If you consented to retain transcripts, they are stored as per retention policy.</li>
                    <li>Screen recording will start when you begin the interview and will be uploaded to the admin storage when you end the interview.</li>
                  </ul>

                  <div className="mt-4 flex items-center gap-3">
                    <input id="ack" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="w-4 h-4" />
                    <label htmlFor="ack" className="text-sm text-gray-700">I acknowledge the instructions and am ready to start the interview.</label>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3">
                    <button onClick={() => { setShowInstructions(false); setInInterview(false); setSessionId(null); }} className="px-4 py-2 rounded-md border">Cancel</button>
                    <button onClick={handleStartInterview} disabled={!ack} className={`px-4 py-2 rounded-md text-white ${ack ? 'bg-black' : 'bg-gray-300 cursor-not-allowed'}`}>Start Interview</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
            )}

        {renderCaptureHelp()}
      </div>
    </div>
  );
}

*/

/*import React, { useRef, useState, useEffect } from 'react';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';

const BACKEND_HTTP = import.meta.env.VITE_PRACTICE_BACKEND_HTTP || 'http://localhost:3001';
const BACKEND_WS = import.meta.env.VITE_PRACTICE_BACKEND_WS || 'ws://localhost:3001/ws';

function AiAvatar({ small }) {
  return (
    <div className={`flex items-center justify-center ${small ? 'w-12 h-12' : 'w-20 h-20'}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={`${small ? 'w-8 h-8' : 'w-16 h-16'}`}>
        <path d="M12,1.5A10.5,10.5,0,1,0,22.5,12,10.5,10.5,0,0,0,12,1.5Zm0,19A8.5,8.5,0,1,1,20.5,12,8.5,8.5,0,0,1,12,20.5Z" />
        <path d="M12,7.5a2,2,0,1,0,2,2A2,2,0,0,0,12,7.5Z" />
        <path d="M12,13.5a5.4,5.4,0,0,0-4.5,2.7,8.4,8.4,0,0,1,9,0A5.4,5.4,0,0,0,12,13.5Z" />
      </svg>
    </div>
  );
}

export default function MockInterviewStudio() {
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [inInterview, setInInterview] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDesc, setJobDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Detecting...');
  const [showInstructions, setShowInstructions] = useState(false);
  const [ack, setAck] = useState(false);
  const [consentRetention, setConsentRetention] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [recordingState, setRecordingState] = useState('idle'); // 'idle'|'recording'|'stopped'|'uploading'|'done'

  const wsRef = useRef(null);
  const tokenRef = useRef(localStorage.getItem('mi_token') || null);
  const userRef = useRef(JSON.parse(localStorage.getItem('mi_user') || 'null'));

  // media refs
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const cameraRef = useRef(null);
  const userVideoRef = useRef(null);

  // recording refs
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const screenStreamRef = useRef(null);
  const micStreamRef = useRef(null);

  // reconnect/backoff state
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);

  useEffect(() => {
    return () => stopInterview();
    // eslint-disable-next-line
  }, []);

  async function login(name) {
    if (!name) return false;
    try {
      const res = await fetch(`${BACKEND_HTTP}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) throw new Error('auth failed');
      const data = await res.json();
      tokenRef.current = data.token;
      userRef.current = data.user;
      localStorage.setItem('mi_token', data.token);
      localStorage.setItem('mi_user', JSON.stringify(data.user));
      setStatus('logged in');
      return true;
    } catch (err) {
      console.error('login failed', err);
      setStatus('auth error');
      return false;
    }
  }

  async function createSessionAndPrepare() {
    if (!tokenRef.current) {
      if (candidateName && candidateName.trim()) {
        setStatus('authenticating...');
        const ok = await login(candidateName.trim());
        if (!ok) return;
      } else {
        alert('Please enter your name in the Job Details section to continue.');
        return;
      }
    }

    setLoading(true);
    setStatus('creating session...');
    try {
      const form = new FormData();
      if (resumeFile) form.append('resume', resumeFile);
      form.append('jobDescText', jobDesc || '');
      form.append('retainTranscripts', consentRetention ? '1' : '0');

      const res = await fetch(`${BACKEND_HTTP}/create-session`, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${tokenRef.current}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'create-session failed');
      }
      const data = await res.json();
      if (!data.sessionId) throw new Error('no sessionId returned');

      setSessionId(data.sessionId);
      setStatus('session ready');

      // Request backend to start assembly server-side (best-effort)
      try {
        await fetch(`${BACKEND_HTTP}/start-interview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ sessionId: data.sessionId })
        });
      } catch (e) {
        console.warn('start-interview call failed (non-fatal)', e);
      }

      // Show 5s loading animation then instructions
      setCountdown(5);
      const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
      await new Promise((r) => setTimeout(r, 5000));
      clearInterval(interval);
      setCountdown(0);

      setLoading(false);
      setShowInstructions(true);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setStatus('session create error');
      alert('Failed to create session. See console for details.');
    }
  }

  // WS open
  function openWs(sessionIdToOpen) {
    if (!sessionIdToOpen || !tokenRef.current) return;
    if (wsRef.current) try { wsRef.current.close(); } catch (e) {}

    const base = BACKEND_WS || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    const wsUrl = `${base}?sessionId=${sessionIdToOpen}&token=${encodeURIComponent(tokenRef.current)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[ws] open');
      reconnectAttemptsRef.current = 0;
      setStatus('connected');
      startMedia();
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === 'llm_processing') setStatus('AI is thinking...');
        if (data?.type === 'llm_feedback' && data.audio) playAiAudio(data.audio);
        if (data?.type === 'assembly_not_ready') console.warn('Assembly not ready on backend');
        if (data?.type === 'session_in_use') alert('Session is in use by another client');
        if (data?.type === 'forbidden') { alert('You are not allowed to connect to this session'); ws.close(); }
      } catch (e) {
        // ignore non-json messages
      }
    };

    ws.onclose = (ev) => {
      console.log('[ws] closed', ev.code, ev.reason);
      setStatus('disconnected');
      wsRef.current = null;
      if (!manualCloseRef.current && sessionId) {
        attemptReconnect();
      }
    };

    ws.onerror = (e) => {
      console.warn('[ws] error', e);
      setStatus('ws error');
    };

    wsRef.current = ws;
  }

  function attemptReconnect() {
    const attempts = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempts;
    const max = Number(process.env.REACT_APP_WS_RECONNECT_MAX || 8);
    if (attempts > max) { setStatus('reconnect failed'); return; }
    const backoff = Math.min(30000, 500 * Math.pow(2, attempts));
    setStatus(`reconnecting (attempt ${attempts})`);
    setTimeout(() => {
      if (!sessionId) return;
      openWs(sessionId);
    }, backoff);
  }

  function playAiAudio(audioBase64) {
    if (audioPlayerRef.current) try { audioPlayerRef.current.pause(); } catch (e) {}
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    setStatus('AI is speaking...');
    audio.play().catch((err) => console.warn(err));
    audio.onended = () => setStatus('recording');
    audioPlayerRef.current = audio;
  }

  async function startMedia() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatus('waiting for connection...');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
      mediaStreamRef.current = stream;
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
        try { await userVideoRef.current.play(); } catch (e) {}
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        try {
          const float32Array = e.inputBuffer.getChannelData(0);
          const int16Buffer = new Int16Array(float32Array.length);
          for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Buffer[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          }
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(int16Buffer.buffer);
          }
        } catch (err) {
          console.warn('audio processing error', err);
        }
      };

      source.connect(processor);
      try { processor.connect(audioContext.destination); } catch (e) {}

      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;

      // face mesh
      const fm = new faceMesh.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      fm.onResults((results) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) setFaceStatus('No face detected');
        else {
          const landmarks = results.multiFaceLandmarks[0];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const nose = landmarks[1];
          const eyeCenterX = (leftEye.x + rightEye.x) / 2;
          if (Math.abs(eyeCenterX - nose.x) < 0.035) setFaceStatus('Eye contact ✅');
          else setFaceStatus('Not looking at screen');
        }
      });

      const camera = new cam.Camera(userVideoRef.current, {
        onFrame: async () => {
          try { await fm.send({ image: userVideoRef.current }); } catch (e) {}
        },
        width: 1280, height: 720
      });
      camera.start();
      cameraRef.current = camera;

      setStatus('recording');
    } catch (err) {
      console.error('startMedia error', err);
      setStatus('error accessing devices');
      alert('Unable to access camera/microphone. Please check permissions.');
    }
  }

  // --------- NEW: screen recording helpers ----------
  async function startScreenRecording() {
    try {
      // get display (screen) stream (ask user to choose screen/window/tab)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).catch((e) => { throw e; });

      // get mic audio stream separately (so we control which audio track used)
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn('Mic access denied or unavailable; continuing without mic audio');
      }

      // combine display video track + audio tracks (mic preferred; include display audio if present)
      const tracks = [];
      if (displayStream.getVideoTracks().length) tracks.push(...displayStream.getVideoTracks());
      if (micStream && micStream.getAudioTracks().length) tracks.push(...micStream.getAudioTracks());
      // If displayStream had audio (user allowed system audio), include it too
      if (displayStream.getAudioTracks && displayStream.getAudioTracks().length) {
        tracks.push(...displayStream.getAudioTracks());
      }

      const combined = new MediaStream(tracks);
      screenStreamRef.current = displayStream;
      micStreamRef.current = micStream;

      // choose supported mimeType
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mimeType = 'video/webm;codecs=vp9';
      else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mimeType = 'video/webm;codecs=vp8';
      else mimeType = 'video/webm';

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(combined, { mimeType });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstart = () => {
        setRecordingState('recording');
        console.log('screen recording started');
      };
      recorder.onstop = () => {
        setRecordingState('stopped');
        console.log('screen recording stopped');
      };
      recorder.onerror = (e) => {
        console.error('MediaRecorder error', e);
      };

      recorder.start(1000); // emit data every 1s
      recorderRef.current = recorder;
    } catch (err) {
      console.error('startScreenRecording failed', err);
      setRecordingState('idle');
      alert('Screen recording failed. Ensure your browser supports getDisplayMedia and you allowed screen capture.');
    }
  }

  async function stopScreenRecordingAndUpload() {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }

      // stop tracks used for recording
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }

      // build blob
      const chunks = recordedChunksRef.current || [];
      if (!chunks.length) {
        setRecordingState('done');
        return null;
      }
      const blob = new Blob(chunks, { type: chunks[0].type || 'video/webm' });
      setRecordingState('uploading');

      // upload to backend
      const form = new FormData();
      const filename = `${sessionId || 'anon'}_${Date.now()}.webm`;
      form.append('video', blob, filename);
      form.append('sessionId', sessionId || '');

      const res = await fetch(`${BACKEND_HTTP}/upload-interview-video`, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${tokenRef.current}` }
      });

      if (!res.ok) {
        console.error('video upload failed', await res.text());
        setRecordingState('done');
        return null;
      }
      const data = await res.json();
      setRecordingState('done');
      return data;
    } catch (err) {
      console.error('stopScreenRecordingAndUpload failed', err);
      setRecordingState('done');
      return null;
    } finally {
      recordedChunksRef.current = [];
      recorderRef.current = null;
    }
  }
  // ---------- end recording helpers ----------

  // Robust stop - stops camera, audio and ws, and optionally calls server /end-session to remove session persistently
  async function stopInterview({ endServerSide = true } = {}) {
    manualCloseRef.current = true;
    setStatus('stopping...');
    // stop audio playback
    if (audioPlayerRef.current) try { audioPlayerRef.current.pause(); } catch (e) {}
    // stop media tracks
    if (mediaStreamRef.current) {
      try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      mediaStreamRef.current = null;
    }
    // stop mediapipe camera
    if (cameraRef.current && cameraRef.current.stop) try { cameraRef.current.stop(); } catch (e) {}
    cameraRef.current = null;
    // disconnect audio nodes
    if (audioProcessorRef.current) try { audioProcessorRef.current.disconnect(); } catch (e) {}
    if (audioSourceRef.current) try { audioSourceRef.current.disconnect(); } catch (e) {}
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch (e) {}
    }
    audioProcessorRef.current = null;
    audioSourceRef.current = null;
    audioContextRef.current = null;

    // close websocket
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }

    // stop and upload recording (if any)
    try {
      const uploadResult = await stopScreenRecordingAndUpload();
      if (uploadResult && uploadResult.ok) {
        console.log('Interview video uploaded:', uploadResult);
        // optionally show a small notification or store the returned URL somewhere
        // For now we update status to notify user
        setStatus('video uploaded');
      } else {
        // no recorded video or upload failed
        if (recordingState === 'idle') setStatus('no recording');
      }
    } catch (e) {
      console.warn('uploadError', e);
    }

    if (endServerSide && sessionId && tokenRef.current) {
      try {
        await fetch(`${BACKEND_HTTP}/end-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ sessionId })
        });
      } catch (e) {
        console.warn('end-session request failed', e);
      }
    }

    setSessionId(null);
    setInInterview(false);
    setStatus('idle');
    setShowInstructions(false);
    setAck(false);
  }

  // Called from UI when user clicks Start Interview after instructions
  async function handleStartInterview() {
    if (!sessionId) return;
    if (!ack) {
      alert('Please acknowledge the instructions to start.');
      return;
    }
    setShowInstructions(false);
    setInInterview(true);
    manualCloseRef.current = false;
    reconnectAttemptsRef.current = 0;

    // Try to start screen recording ASAP (so the whole session is captured)
    await startScreenRecording();

    // open WS to start audio streaming to backend/assembly
    openWs(sessionId);
  }

  // UI helpers (unchanged)
  const PrimaryButton = ({ children, onClick, className = '', disabled = false }) => (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-medium shadow ${disabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:opacity-95'} ${className}`}>{children}</button>
  );
  const SecondaryButton = ({ children, onClick, className = '' }) => (
    <button onClick={onClick} className={`inline-flex items-center justify-center px-4 py-2 rounded-md text-sm border ${className}`}>{children}</button>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      <div className="max-w-6xl mx-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white border rounded-xl flex items-center justify-center shadow-sm">
              <AiAvatar />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Mock Interview Studio</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">Resilient, production-ready mock interview UI — white-only theme.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-400">Status</div>
              <div className="mt-1 px-3 py-2 border rounded-lg w-56 text-sm bg-gray-50 flex items-center justify-between">
                <span className="truncate">{status}{recordingState === 'recording' ? ' • REC' : ''}</span>
                <span className="ml-2 text-xs font-mono text-gray-400">{sessionId ? sessionId.slice(0,8) : null}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!inInterview && <PrimaryButton onClick={createSessionAndPrepare} disabled={loading}>{loading ? 'Preparing…' : 'Start Interview'}</PrimaryButton>}
              {inInterview && <button onClick={() => stopInterview({ endServerSide: true })} className="px-4 py-2 rounded-full bg-red-600 text-white text-sm shadow hover:opacity-95">End</button>}
            </div>
          </div>
        </header>

        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full border-8 border-gray-200 border-t-black animate-spin" />
              <div className="text-lg font-medium">Starting your interview</div>
              <div className="text-sm text-gray-500">Preparing environment…</div>
              {countdown > 0 && <div className="mt-2 text-2xl font-semibold">{countdown}</div>}
            </div>
          </div>
        )}

        {inInterview ? (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-500">Interview</div>
                  <div className="text-lg font-semibold">Live Session {sessionId ? <span className="ml-2 text-xs font-mono text-gray-400">{sessionId.slice(0,8)}</span> : null}</div>
                </div>
                <div className="text-sm text-gray-500">Status: <span className="font-medium text-gray-800">{status}</span></div>
              </div>

              <div className="flex-1 bg-gray-50 rounded-xl border overflow-hidden relative min-h-[360px]">
                <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover bg-black" style={{ transform: 'scaleX(-1)' }} />

                <div className="absolute bottom-6 left-6 bg-white/95 border rounded-2xl p-3 shadow-lg flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <AiAvatar small />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">AI Interviewer</div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">{status}</div>
                  </div>
                </div>

                <div className="absolute top-4 left-4 bg-white/90 px-3 py-1 rounded-full text-sm border">{faceStatus}</div>
              </div>

              <div className="mt-4 text-sm text-gray-500">Tip: Keep your camera at eye-level and look at the center of the screen for good eye-contact.</div>
            </div>

            <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-500">Coding Terminal</div>
                  <div className="text-lg font-semibold">Live Problem</div>
                </div>
                <div className="text-sm text-gray-500">Controls</div>
              </div>

              <div className="flex-1 bg-neutral-900 rounded-lg p-3 overflow-auto flex flex-col">
                <div className="text-xs text-gray-400 mb-2">// Write your code here</div>
                <textarea className="w-full flex-1 min-h-[240px] bg-neutral-900 text-white resize-none outline-none text-sm font-mono p-3 rounded" defaultValue={`// Sample starter\nfunction solution() {\n  // ...\n}`} />

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-gray-400">Session: <span className="font-mono text-white">{sessionId || '—'}</span></div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-2 bg-white text-black rounded-md">Run</button>
                    <button onClick={() => stopInterview({ endServerSide: true })} className="px-3 py-2 bg-red-600 text-white rounded-md">End</button>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-400">QA: The assistant will provide feedback as audio and text during the interview.</div>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-6 mt-6">
            <div className="bg-white border rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-semibold">Job Details</h2>
              <p className="text-sm text-gray-500 mt-2">Provide resume (optional) and paste the job description. Also consent to transcript retention for better feedback (optional).</p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Candidate name</div>
                  <input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Your full name" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gray-100" />
                </div>

                <div>
                  <div className="text-xs text-gray-500">Position</div>
                  <input placeholder="Job title (optional)" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gray-100" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Resume (optional)</div>
                  <input onChange={(e) => setResumeFile(e.target.files?.[0] || null)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" type="file" accept=".pdf,text/plain" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Job Description (paste here)</div>
                  <textarea value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} placeholder="Paste or type the job description — this will be used to tailor questions." className="mt-1 w-full min-h-[140px] p-3 border rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2 flex items-start gap-3">
                  <input id="consent" type="checkbox" checked={consentRetention} onChange={(e) => setConsentRetention(e.target.checked)} className="w-4 h-4 mt-1" />
                  <label htmlFor="consent" className="text-xs text-gray-700">I consent to retaining transcript & memory to improve feedback (retention policy applies)</label>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <PrimaryButton onClick={createSessionAndPrepare} disabled={loading || (!tokenRef.current && !candidateName.trim())}>Start Interview</PrimaryButton>
              </div>
            </div>
          </section>
        )}

        {showInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[720px] bg-white rounded-2xl p-6 shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <AiAvatar />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Interview Instructions</h3>
                  <p className="text-sm text-gray-600 mt-2">Welcome! A few quick instructions.</p>

                  <ul className="mt-3 text-sm text-gray-700 list-disc ml-5 space-y-2">
                    <li>Ensure your camera and mic are enabled and not used by another app.</li>
                    <li>If your connection drops, the interviewer will resume when you reconnect (use the same browser/token).</li>
                    <li>End will remove the session from the server (irreversible).</li>
                    <li>If you consented to retain transcripts, they are stored as per retention policy.</li>
                    <li>Screen recording will start when you begin the interview and will be uploaded to the admin storage when you end the interview.</li>
                  </ul>

                  <div className="mt-4 flex items-center gap-3">
                    <input id="ack" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="w-4 h-4" />
                    <label htmlFor="ack" className="text-sm text-gray-700">I acknowledge the instructions and am ready to start the interview.</label>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3">
                    <button onClick={() => { setShowInstructions(false); setInInterview(false); setSessionId(null); }} className="px-4 py-2 rounded-md border">Cancel</button>
                    <button onClick={handleStartInterview} disabled={!ack} className={`px-4 py-2 rounded-md text-white ${ack ? 'bg-black' : 'bg-gray-300 cursor-not-allowed'}`}>Start Interview</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}*/

import React, { useRef, useState, useEffect } from 'react';
import * as faceMesh from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';

const BACKEND_HTTP = import.meta.env.VITE_PRACTICE_BACKEND_HTTP || 'https://rigal.in';
const BACKEND_WS = import.meta.env.VITE_PRACTICE_BACKEND_WS || 'wss://rigal.in/ws';

function AiAvatar({ small }) {
  return (
    <div className={`flex items-center justify-center ${small ? 'w-12 h-12' : 'w-20 h-20'}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={`${small ? 'w-8 h-8' : 'w-16 h-16'}`}>
        <path d="M12,1.5A10.5,10.5,0,1,0,22.5,12,10.5,10.5,0,0,0,12,1.5Zm0,19A8.5,8.5,0,1,1,20.5,12,8.5,8.5,0,0,1,12,20.5Z" />
        <path d="M12,7.5a2,2,0,1,0,2,2A2,2,0,0,0,12,7.5Z" />
        <path d="M12,13.5a5.4,5.4,0,0,0-4.5,2.7,8.4,8.4,0,0,1,9,0A5.4,5.4,0,0,0,12,13.5Z" />
      </svg>
    </div>
  );
}

export default function MockInterviewStudio() {
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [inInterview, setInInterview] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDesc, setJobDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Detecting...');
  const [showInstructions, setShowInstructions] = useState(false);
  const [ack, setAck] = useState(false);
  const [consentRetention, setConsentRetention] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [recordingState, setRecordingState] = useState('idle'); // 'idle'|'recording'|'stopped'|'done'

  // --- MODIFIED: A single state for all full-screen loading messages ---
  const [loadingMessage, setLoadingMessage] = useState('');

  const wsRef = useRef(null);
  const tokenRef = useRef(localStorage.getItem('mi_token') || null);
  const userRef = useRef(JSON.parse(localStorage.getItem('mi_user') || 'null'));

  // media refs
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const cameraRef = useRef(null);
  const userVideoRef = useRef(null);

  // recording refs
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const screenStreamRef = useRef(null);
  const micStreamRef = useRef(null);

  // reconnect/backoff state
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);

  useEffect(() => {
    return () => stopInterview({ endServerSide: false }); // Prevent call on unmount
    // eslint-disable-next-line
  }, []);

  async function login(name) {
    if (!name) return false;
    try {
      const res = await fetch(`${BACKEND_HTTP}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) throw new Error('auth failed');
      const data = await res.json();
      tokenRef.current = data.token;
      userRef.current = data.user;
      localStorage.setItem('mi_token', data.token);
      localStorage.setItem('mi_user', JSON.stringify(data.user));
      setStatus('logged in');
      return true;
    } catch (err) {
      console.error('login failed', err);
      setStatus('auth error');
      return false;
    }
  }

  async function createSessionAndPrepare() {
    if (!tokenRef.current) {
      if (candidateName && candidateName.trim()) {
        setStatus('authenticating...');
        const ok = await login(candidateName.trim());
        if (!ok) return;
      } else {
        alert('Please enter your name in the Job Details section to continue.');
        return;
      }
    }

    setLoading(true);
    setStatus('creating session...');
    try {
      const form = new FormData();
      if (resumeFile) form.append('resume', resumeFile);
      form.append('jobDescText', jobDesc || '');
      form.append('retainTranscripts', consentRetention ? '1' : '0');

      const res = await fetch(`${BACKEND_HTTP}/create-session`, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${tokenRef.current}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'create-session failed');
      }
      const data = await res.json();
      if (!data.sessionId) throw new Error('no sessionId returned');

      setSessionId(data.sessionId);
      setStatus('session ready');

      // Request backend to start assembly server-side (best-effort)
      try {
        await fetch(`${BACKEND_HTTP}/start-interview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ sessionId: data.sessionId })
        });
      } catch (e) {
        console.warn('start-interview call failed (non-fatal)', e);
      }

      setLoading(false);
      setShowInstructions(true);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setStatus('session create error');
      alert('Failed to create session. See console for details.');
    }
  }

  // WS open
  function openWs(sessionIdToOpen) {
    if (!sessionIdToOpen || !tokenRef.current) return;
    if (wsRef.current) try { wsRef.current.close(); } catch (e) {}

    const base = BACKEND_WS || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    const wsUrl = `${base}?sessionId=${sessionIdToOpen}&token=${encodeURIComponent(tokenRef.current)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[ws] open');
      reconnectAttemptsRef.current = 0;
      setStatus('connected');
      startMedia();
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        // --- ADDITION: Wait for assembly_ready signal before starting interview UI ---
        if (data?.type === 'assembly_ready') {
          console.log('AssemblyAI is ready. Starting interview pane.');
          setLoadingMessage(''); // Hide loading screen
          setInInterview(true); // Show interview pane
          startScreenRecording(); // Now start screen recording
          return; // Message handled
        }

        if (data?.type === 'llm_processing') setStatus('AI is thinking...');
        if (data?.type === 'llm_feedback' && data.audio) playAiAudio(data.audio);
        if (data?.type === 'assembly_not_ready') console.warn('Assembly not ready on backend');
        if (data?.type === 'session_in_use') alert('Session is in use by another client');
        if (data?.type === 'forbidden') { alert('You are not allowed to connect to this session'); ws.close(); }
      } catch (e) {
        // ignore non-json messages
      }
    };

    ws.onclose = (ev) => {
      console.log('[ws] closed', ev.code, ev.reason);
      setStatus('disconnected');
      wsRef.current = null;
      if (!manualCloseRef.current && sessionId) {
        attemptReconnect();
      }
    };

    ws.onerror = (e) => {
      console.warn('[ws] error', e);
      setLoadingMessage('');
      setStatus('ws error');
    };

    wsRef.current = ws;
  }

  function attemptReconnect() {
    const attempts = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempts;
    const max = Number(process.env.REACT_APP_WS_RECONNECT_MAX || 8);
    if (attempts > max) { setStatus('reconnect failed'); return; }
    const backoff = Math.min(30000, 500 * Math.pow(2, attempts));
    setStatus(`reconnecting (attempt ${attempts})`);
    setTimeout(() => {
      if (!sessionId) return;
      openWs(sessionId);
    }, backoff);
  }

  function playAiAudio(audioBase64) {
    if (audioPlayerRef.current) try { audioPlayerRef.current.pause(); } catch (e) {}
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    setStatus('AI is speaking...');
    audio.play().catch((err) => console.warn(err));
    audio.onended = () => setStatus('recording');
    audioPlayerRef.current = audio;
  }

  async function startMedia() {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatus('waiting for connection...');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } });
      mediaStreamRef.current = stream;
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
        try { await userVideoRef.current.play(); } catch (e) {}
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        try {
          const float32Array = e.inputBuffer.getChannelData(0);
          const int16Buffer = new Int16Array(float32Array.length);
          for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Buffer[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
          }
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(int16Buffer.buffer);
          }
        } catch (err) {
          console.warn('audio processing error', err);
        }
      };

      source.connect(processor);
      try { processor.connect(audioContext.destination); } catch (e) {}

      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;

      // face mesh
      const fm = new faceMesh.FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      fm.onResults((results) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) setFaceStatus('No face detected');
        else {
          const landmarks = results.multiFaceLandmarks[0];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const nose = landmarks[1];
          const eyeCenterX = (leftEye.x + rightEye.x) / 2;
          if (Math.abs(eyeCenterX - nose.x) < 0.035) setFaceStatus('Eye contact ✅');
          else setFaceStatus('Not looking at screen');
        }
      });

      const camera = new cam.Camera(userVideoRef.current, {
        onFrame: async () => {
          try { await fm.send({ image: userVideoRef.current }); } catch (e) {}
        },
        width: 1280, height: 720
      });
      camera.start();
      cameraRef.current = camera;

      setStatus('recording');
    } catch (err) {
      console.error('startMedia error', err);
      setStatus('error accessing devices');
      alert('Unable to access camera/microphone. Please check permissions.');
    }
  }

  async function startScreenRecording() {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).catch((e) => { throw e; });
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn('Mic access denied or unavailable; continuing without mic audio');
      }

      const tracks = [];
      if (displayStream.getVideoTracks().length) tracks.push(...displayStream.getVideoTracks());
      if (micStream && micStream.getAudioTracks().length) tracks.push(...micStream.getAudioTracks());
      if (displayStream.getAudioTracks && displayStream.getAudioTracks().length) {
        tracks.push(...displayStream.getAudioTracks());
      }

      const combined = new MediaStream(tracks);
      screenStreamRef.current = displayStream;
      micStreamRef.current = micStream;

      let mimeType = '';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mimeType = 'video/webm;codecs=vp9';
      else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mimeType = 'video/webm;codecs=vp8';
      else mimeType = 'video/webm';

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(combined, { mimeType });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstart = () => {
        setRecordingState('recording');
        console.log('screen recording started');
      };
      recorder.onstop = () => {
        setRecordingState('stopped');
        console.log('screen recording stopped');
      };
      recorder.onerror = (e) => {
        console.error('MediaRecorder error', e);
      };

      recorder.start(1000); // emit data every 1s
      recorderRef.current = recorder;
    } catch (err) {
      console.error('startScreenRecording failed', err);
      setRecordingState('idle');
      alert('Screen recording failed. Ensure your browser supports getDisplayMedia and you allowed screen capture.');
    }
  }

  // --- MODIFIED: This function is now simpler and just handles the upload logic ---
  async function stopScreenRecordingAndUpload() {
    const stopPromise = new Promise(resolve => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.onstop = () => {
                resolve();
            };
            recorderRef.current.stop();
        } else {
            resolve();
        }
    });

    await stopPromise;

    try {
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      micStreamRef.current = null;

      const chunks = recordedChunksRef.current || [];
      if (!chunks.length) {
        console.log('No recorded chunks to upload.');
        return null;
      }
      
      const blob = new Blob(chunks, { type: chunks[0].type || 'video/webm' });
      const form = new FormData();
      const filename = `${sessionId || 'anon'}_${Date.now()}.webm`;
      form.append('video', blob, filename);
      form.append('sessionId', sessionId || '');

      const res = await fetch(`${BACKEND_HTTP}/upload-interview-video`, {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${tokenRef.current}` }
      });

      if (!res.ok) {
        console.error('video upload failed', await res.text());
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error('stopScreenRecordingAndUpload failed', err);
      return null;
    } finally {
      recordedChunksRef.current = [];
      recorderRef.current = null;
      setRecordingState('done');
    }
  }

  // --- MODIFIED: Robust stop function that guarantees loading screen on upload ---
  async function stopInterview({ endServerSide = true } = {}) {
    manualCloseRef.current = true;
    setStatus('stopping...');
    
    // Stop all real-time media and connections first
    if (audioPlayerRef.current) try { audioPlayerRef.current.pause(); } catch (e) {}
    if (mediaStreamRef.current) try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
    if (cameraRef.current && cameraRef.current.stop) try { cameraRef.current.stop(); } catch (e) {}
    if (audioProcessorRef.current) try { audioProcessorRef.current.disconnect(); } catch (e) {}
    if (audioSourceRef.current) try { audioSourceRef.current.disconnect(); } catch (e) {}
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { await audioContextRef.current.close(); } catch (e) {}
    }
    if (wsRef.current) try { wsRef.current.close(); } catch (e) {}

    mediaStreamRef.current = null;
    cameraRef.current = null;
    audioProcessorRef.current = null;
    audioSourceRef.current = null;
    audioContextRef.current = null;
    wsRef.current = null;

    const wasRecording = recorderRef.current && recorderRef.current.state === 'recording';
    if (wasRecording) {
      setLoadingMessage('Sending the video to our servers...');
      await stopScreenRecordingAndUpload();
      setLoadingMessage('');
    } else {
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    }

    setInInterview(false);

    if (endServerSide && sessionId && tokenRef.current) {
      try {
        await fetch(`${BACKEND_HTTP}/end-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
          body: JSON.stringify({ sessionId })
        });
      } catch (e) {
        console.warn('end-session request failed', e);
      }
    }

    setSessionId(null);
    setStatus('idle');
    setShowInstructions(false);
    setAck(false);
  }

  // Called from UI when user clicks Start Interview after instructions
  async function handleStartInterview() {
    if (!sessionId) return;
    if (!ack) {
      alert('Please acknowledge the instructions to start.');
      return;
    }
    setShowInstructions(false);
    setLoadingMessage('Connecting to live session...');
    manualCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    openWs(sessionId);
  }

  const PrimaryButton = ({ children, onClick, className = '', disabled = false }) => (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-medium shadow ${disabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:opacity-95'} ${className}`}>{children}</button>
  );
  
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      <div className="max-w-6xl mx-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white border rounded-xl flex items-center justify-center shadow-sm">
              <AiAvatar />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Mock Interview Studio</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">Resilient, production-ready mock interview UI — white-only theme.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-400">Status</div>
              <div className="mt-1 px-3 py-2 border rounded-lg w-56 text-sm bg-gray-50 flex items-center justify-between">
                <span className="truncate">{status}{recordingState === 'recording' ? ' • REC' : ''}</span>
                <span className="ml-2 text-xs font-mono text-gray-400">{sessionId ? sessionId.slice(0,8) : null}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!inInterview && <PrimaryButton onClick={createSessionAndPrepare} disabled={loading}>{loading ? 'Preparing…' : 'Start Interview'}</PrimaryButton>}
              {inInterview && <button onClick={() => stopInterview({ endServerSide: true })} className="px-4 py-2 rounded-full bg-red-600 text-white text-sm shadow hover:opacity-95">End</button>}
            </div>
          </div>
        </header>

        {loading && !showInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full border-8 border-gray-200 border-t-black animate-spin" />
              <div className="text-lg font-medium">Creating your session</div>
              <div className="text-sm text-gray-500">Preparing environment…</div>
            </div>
          </div>
        )}

        {/* --- MODIFIED: Single, unified loading overlay --- */}
        {loadingMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-24 h-24 rounded-full border-8 border-gray-200 border-t-black animate-spin" />
              <div className="text-lg font-medium">{loadingMessage}</div>
              <div className="text-sm text-gray-500">Please wait, this may take a moment.</div>
            </div>
          </div>
        )}
        
        {inInterview ? (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-500">Interview</div>
                  <div className="text-lg font-semibold">Live Session {sessionId ? <span className="ml-2 text-xs font-mono text-gray-400">{sessionId.slice(0,8)}</span> : null}</div>
                </div>
                <div className="text-sm text-gray-500">Status: <span className="font-medium text-gray-800">{status}</span></div>
              </div>

              <div className="flex-1 bg-gray-50 rounded-xl border overflow-hidden relative min-h-[360px]">
                <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover bg-black" style={{ transform: 'scaleX(-1)' }} />

                <div className="absolute bottom-6 left-6 bg-white/95 border rounded-2xl p-3 shadow-lg flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <AiAvatar small />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">AI Interviewer</div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">{status}</div>
                  </div>
                </div>

                <div className="absolute top-4 left-4 bg-white/90 px-3 py-1 rounded-full text-sm border">{faceStatus}</div>
              </div>

              <div className="mt-4 text-sm text-gray-500">Tip: Keep your camera at eye-level and look at the center of the screen for good eye-contact.</div>
            </div>

            <div className="bg-white border rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-gray-500">Coding Terminal</div>
                  <div className="text-lg font-semibold">Live Problem</div>
                </div>
                <div className="text-sm text-gray-500">Controls</div>
              </div>

              <div className="flex-1 bg-neutral-900 rounded-lg p-3 overflow-auto flex flex-col">
                <div className="text-xs text-gray-400 mb-2">// Write your code here</div>
                <textarea className="w-full flex-1 min-h-[240px] bg-neutral-900 text-white resize-none outline-none text-sm font-mono p-3 rounded" defaultValue={`// Sample starter\nfunction solution() {\n  // ...\n}`} />

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-gray-400">Session: <span className="font-mono text-white">{sessionId || '—'}</span></div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-2 bg-white text-black rounded-md">Run</button>
                    <button onClick={() => stopInterview({ endServerSide: true })} className="px-3 py-2 bg-red-600 text-white rounded-md">End</button>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-400">QA: The assistant will provide feedback as audio and text during the interview.</div>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-6 mt-6">
            <div className="bg-white border rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-semibold">Job Details</h2>
              <p className="text-sm text-gray-500 mt-2">Provide resume (optional) and paste the job description. Also consent to transcript retention for better feedback (optional).</p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Candidate name</div>
                  <input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Your full name" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gray-100" />
                </div>

                <div>
                  <div className="text-xs text-gray-500">Position</div>
                  <input placeholder="Job title (optional)" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gray-100" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Resume (optional)</div>
                  <input onChange={(e) => setResumeFile(e.target.files?.[0] || null)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" type="file" accept=".pdf,text/plain" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Job Description (paste here)</div>
                  <textarea value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} placeholder="Paste or type the job description — this will be used to tailor questions." className="mt-1 w-full min-h-[140px] p-3 border rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2 flex items-start gap-3">
                  <input id="consent" type="checkbox" checked={consentRetention} onChange={(e) => setConsentRetention(e.target.checked)} className="w-4 h-4 mt-1" />
                  <label htmlFor="consent" className="text-xs text-gray-700">I consent to retaining transcript & memory to improve feedback (retention policy applies)</label>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <PrimaryButton onClick={createSessionAndPrepare} disabled={loading || (!tokenRef.current && !candidateName.trim())}>Start Interview</PrimaryButton>
              </div>
            </div>
          </section>
        )}

        {showInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-[720px] bg-white rounded-2xl p-6 shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <AiAvatar />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Interview Instructions</h3>
                  <p className="text-sm text-gray-600 mt-2">Welcome! A few quick instructions.</p>

                  <ul className="mt-3 text-sm text-gray-700 list-disc ml-5 space-y-2">
                    <li>Ensure your camera and mic are enabled and not used by another app.</li>
                    <li>If your connection drops, the interviewer will resume when you reconnect (use the same browser/token).</li>
                    <li>End will remove the session from the server (irreversible).</li>
                    <li>If you consented to retain transcripts, they are stored as per retention policy.</li>
                    <li>Screen recording will start when you begin the interview and will be uploaded to the admin storage when you end the interview.</li>
                  </ul>

                  <div className="mt-4 flex items-center gap-3">
                    <input id="ack" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="w-4 h-4" />
                    <label htmlFor="ack" className="text-sm text-gray-700">I acknowledge the instructions and am ready to start the interview.</label>
                  </div>

                  <div className="mt-5 flex items-center justify-end gap-3">
                    <button onClick={() => { setShowInstructions(false); setInInterview(false); setSessionId(null); }} className="px-4 py-2 rounded-md border">Cancel</button>
                    <button onClick={handleStartInterview} disabled={!ack} className={`px-4 py-2 rounded-md text-white ${ack ? 'bg-black' : 'bg-gray-300 cursor-not-allowed'}`}>Start Interview</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}