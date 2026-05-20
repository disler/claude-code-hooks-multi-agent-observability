// Browser speech-to-text via Web Speech API. Safari iOS + Chromium support;
// silently no-ops on Firefox.
import { ref, onUnmounted } from 'vue';

type Recognition = any;

export function useSpeechToText() {
  const supported = ref(false);
  const listening = ref(false);
  const transcript = ref('');
  const error = ref<string | null>(null);
  let recognition: Recognition | null = null;

  // @ts-ignore browser-vendor variants
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (SpeechRecognition) {
    supported.value = true;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (e: any) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      transcript.value = (final || interim).trim();
    };
    recognition.onerror = (e: any) => {
      error.value = e?.error || 'speech error';
      listening.value = false;
    };
    recognition.onend = () => { listening.value = false; };
  }

  function start() {
    if (!recognition || listening.value) return;
    error.value = null;
    transcript.value = '';
    try { recognition.start(); listening.value = true; }
    catch (e: any) { error.value = e?.message || 'start failed'; }
  }
  function stop() {
    if (!recognition || !listening.value) return;
    try { recognition.stop(); } catch {}
    listening.value = false;
  }
  function toggle() { listening.value ? stop() : start(); }

  onUnmounted(() => stop());

  return { supported, listening, transcript, error, start, stop, toggle };
}
