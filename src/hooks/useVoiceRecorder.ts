// src/hooks/useVoiceRecorder.ts
// Hook para gravação de áudio para voice input

import { useState, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

interface UseVoiceRecorderOptions {
  onRecordingComplete: (audioBlob: Blob) => void;
  onError?: (error: Error) => void;
}

interface UseVoiceRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

/**
 * Solicita permissão de microfone
 * Em plataformas nativas, usa a API de permissões do navegador que dispara o diálogo do Android
 */
async function requestMicrophonePermission(): Promise<boolean> {
  try {
    // Verifica se já tem permissão
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log('[VoiceRecorder] Current permission state:', result.state);

      if (result.state === 'granted') {
        return true;
      }
    }

    // Solicita permissão tentando acessar o microfone
    // Isso dispara o diálogo de permissão do Android
    console.log('[VoiceRecorder] Requesting microphone permission...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Permissão concedida, fecha o stream imediatamente
    stream.getTracks().forEach(track => track.stop());
    console.log('[VoiceRecorder] Permission granted');
    return true;
  } catch (err) {
    console.error('[VoiceRecorder] Permission denied or error:', err);
    return false;
  }
}

/**
 * Hook para gravar áudio do microfone
 * Usado para voice input na calculadora
 */
export function useVoiceRecorder({
  onRecordingComplete,
  onError,
}: UseVoiceRecorderOptions): UseVoiceRecorderReturn {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      // Em plataforma nativa, solicita permissão primeiro
      if (Capacitor.isNativePlatform()) {
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
          throw new Error('Microphone permission denied. Please allow microphone access in your device settings.');
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];

      recorder.ondataavailable = (event) => {
        console.log('[VoiceRecorder] Data available, size:', event.data.size);
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('[VoiceRecorder] Recording stopped, chunks:', audioChunks.current.length);
        const totalSize = audioChunks.current.reduce((acc, chunk) => acc + chunk.size, 0);
        console.log('[VoiceRecorder] Total audio size:', totalSize, 'bytes');

        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        console.log('[VoiceRecorder] Created blob, size:', audioBlob.size);
        onRecordingComplete(audioBlob);

        // Limpa as faixas de áudio para desligar o microfone
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.onerror = (event) => {
        console.error('[VoiceRecorder] Recorder error:', event);
      };

      mediaRecorder.current = recorder;
      // Request data every 1 second to ensure we capture audio
      recorder.start(1000);
      console.log('[VoiceRecorder] Recording started with timeslice 1000ms');
      setIsRecording(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to access microphone');
      console.error('[VoiceRecorder] Error:', error);
      onError?.(error);
    }
  }, [onRecordingComplete, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}
