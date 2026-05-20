// Thin Web Speech API wrapper for dictation into text fields.
// Returns reactive listening state + start/stop + on-result callback.
import { ref, onUnmounted } from 'vue';

interface WSpeech { new (): any }
declare global { interface Window { SpeechRecognition?: WSpeech; webkitSpeechRecognition?: WSpeech } }

export function useVoiceDictation(opts: { onFinal: (text: string) => void; onInterim?: (text: string) => void }) {
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const listening = ref(false);
  const error = ref<string | null>(null);

  let recognition: any = null;

  function start() {
    if (!supported) {
      error.value = 'Voice not supported in this browser';
      return;
    }
    if (listening.value) return;
    error.value = null;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition!;
    recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onstart = () => { listening.value = true; };
    recognition.onerror = (ev: any) => {
      error.value = ev.error || 'recognition error';
      listening.value = false;
    };
    recognition.onend = () => { listening.value = false; };
    recognition.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const text = r[0].transcript;
        if (r.isFinal) opts.onFinal(text);
        else opts.onInterim?.(text);
      }
    };
    try { recognition.start(); } catch (e: any) { error.value = e.message; }
  }

  function stop() {
    if (recognition) {
      try { recognition.stop(); } catch {/* ignore */}
      recognition = null;
    }
    listening.value = false;
  }

  onUnmounted(stop);
  return { supported, listening, error, start, stop };
}
