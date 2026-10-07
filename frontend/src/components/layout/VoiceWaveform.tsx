import { useEffect, useRef, useState } from 'react';

/** Microphone samples stay in memory; this component does not record or upload audio. */
export function VoiceWaveform() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Opening microphone visualizer...');
  useEffect(() => {
    let disposed = false, frame = 0, stream: MediaStream | undefined, audio: AudioContext | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    const release = () => {
      cancelAnimationFrame(frame);
      source?.disconnect(); source = undefined;
      stream?.getTracks().forEach(track => track.stop()); stream = undefined;
      if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
      audio = undefined;
    };
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('unsupported');
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (disposed) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        audio = new AudioContext();
        const analyser = audio.createAnalyser(); analyser.fftSize = 1024;
        source = audio.createMediaStreamSource(stream); source.connect(analyser);
        await audio.resume();
        if (disposed) return;
        const context = canvas.current?.getContext('2d');
        if (!context) throw new Error('canvas');
        const samples = new Uint8Array(analyser.fftSize), levels = Array<number>(88).fill(0);
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let last = 0;
        setStatus('Listening - speak naturally');
        stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
          release(); if (!disposed) setStatus('Microphone visualizer disconnected. Stop and try again.');
        }, { once: true }));
        const draw = (now: number) => {
          if (disposed || !canvas.current) return;
          frame = requestAnimationFrame(draw);
          if (now - last < (reducedMotion ? 180 : 40)) return;
          last = now;
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
          levels.shift(); levels.push(Math.min(1, rms * 5));
          const element = canvas.current, width = element.clientWidth, height = 64, ratio = window.devicePixelRatio || 1;
          if (element.width !== Math.round(width * ratio) || element.height !== height * ratio) {
            element.width = Math.round(width * ratio); element.height = height * ratio;
          }
          context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
          const gradient = context.createLinearGradient(0, 0, width, 0);
          gradient.addColorStop(0, '#4c6bce'); gradient.addColorStop(0.5, '#23b6c4'); gradient.addColorStop(1, '#22b997');
          context.strokeStyle = gradient; context.lineWidth = Math.max(2, Math.min(4, width / 150)); context.lineCap = 'round';
          levels.forEach((level, i) => {
            const x = (i + 0.5) * width / levels.length, amplitude = Math.max(1, level * 28);
            context.beginPath(); context.moveTo(x, height / 2 - amplitude); context.lineTo(x, height / 2 + amplitude); context.stroke();
          });
        };
        frame = requestAnimationFrame(draw);
      } catch {
        release();
        if (!disposed) setStatus('Waveform unavailable. You can still review dictated text below.');
      }
    }
    void start();
    return () => { disposed = true; release(); };
  }, []);
  return <div className="assistant-voice-visualizer"><canvas ref={canvas} aria-hidden="true" /><span role="status">{status}</span></div>;
}
