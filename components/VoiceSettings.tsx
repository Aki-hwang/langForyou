"use client";

import { useEffect, useState } from "react";
import {
  getPreferredVoiceURI,
  isVoiceBroken,
  listVoices,
  previewVoice,
  setPreferredVoice,
  voiceQuality,
  type TtsLang,
  type VoiceQuality,
} from "@/lib/tts";

const QUALITY_LABEL: Record<Exclude<VoiceQuality, null>, string> = {
  premium: "프리미엄",
  enhanced: "향상됨",
  compact: "기본",
};

/** 미리듣기 결과 — 재생 불가 음성을 표시하기 위해 */
type PreviewState = Record<string, "playing" | "ok" | "fail">;

/**
 * 음성 선택 바텀시트.
 * 기기에 설치된 일본어/한국어 음성을 미리 들어보고 선택한다.
 * 선택은 저장되어 단어 학습·퀴즈·연속듣기 모두에 적용된다.
 * (클릭 후에만 마운트되므로 SSR과 무관 — 렌더 중 브라우저 API 접근 안전)
 */
export default function VoiceSettings({ onClose }: { onClose: () => void }) {
  const [voices, setVoices] = useState(() => ({
    ja: listVoices("ja-JP"),
    ko: listVoices("ko-KR"),
  }));
  const [pref, setPref] = useState(() => ({
    ja: getPreferredVoiceURI("ja-JP"),
    ko: getPreferredVoiceURI("ko-KR"),
  }));

  // 일부 브라우저는 음성 목록이 늦게 로드됨
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const reload = () =>
      setVoices({ ja: listVoices("ja-JP"), ko: listVoices("ko-KR") });
    synth.addEventListener("voiceschanged", reload);
    return () => synth.removeEventListener("voiceschanged", reload);
  }, []);

  const [preview, setPreview] = useState<PreviewState>({});

  async function runPreview(v: SpeechSynthesisVoice, lang: TtsLang) {
    setPreview((p) => ({ ...p, [v.voiceURI]: "playing" }));
    const ok = await previewVoice(v, lang);
    setPreview((p) => ({ ...p, [v.voiceURI]: ok ? "ok" : "fail" }));
  }

  function choose(lang: TtsLang, voiceURI: string | null) {
    setPreferredVoice(lang, voiceURI);
    setPref((p) => ({ ...p, [lang === "ja-JP" ? "ja" : "ko"]: voiceURI }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">음성 설정</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-muted"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          🔊 버튼으로 들어보고 마음에 드는 음성을 선택하세요. 학습·퀴즈·연속듣기에
          모두 적용돼요.
        </p>

        <VoiceSection
          title="일본어 음성"
          lang="ja-JP"
          voices={voices.ja}
          selected={pref.ja}
          preview={preview}
          onPreview={runPreview}
          onChoose={choose}
        />
        <VoiceSection
          title="한국어 음성 (뜻 읽기)"
          lang="ko-KR"
          voices={voices.ko}
          selected={pref.ko}
          preview={preview}
          onPreview={runPreview}
          onChoose={choose}
        />

        <p className="mt-5 rounded-2xl bg-foreground/5 p-3.5 text-[11px] leading-relaxed text-muted">
          💡 더 자연스러운 음성을 원하면 기기에 고품질 음성을 설치하세요.
          <br />
          iPhone: 설정 → 손쉬운 사용 → 읽기 및 말하기 → 음성 → 일본어에서
          &ldquo;Kyoko (향상됨)&rdquo; 다운로드 후 Safari를 완전히 껐다 켜기.
          프리미엄 음성(O-ren 등)은 Safari에 나타나지 않을 수 있어요.
          <br />
          🔇 소리가 전혀 안 나면 무음 모드를 끄고 볼륨을 올려 보세요.
          <br />
          Android: Google TTS(스피치 서비스) 설치 후 일본어 음성 데이터 다운로드
        </p>
      </div>
    </div>
  );
}

function VoiceSection({
  title,
  lang,
  voices,
  selected,
  preview,
  onPreview,
  onChoose,
}: {
  title: string;
  lang: TtsLang;
  voices: SpeechSynthesisVoice[];
  selected: string | null;
  preview: PreviewState;
  onPreview: (v: SpeechSynthesisVoice, lang: TtsLang) => void;
  onChoose: (lang: TtsLang, voiceURI: string | null) => void;
}) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      {voices.length === 0 ? (
        <p className="rounded-2xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          이 기기에서 사용할 수 있는 음성이 없어요.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-soft">
          {/* 자동 선택 */}
          <VoiceRow
            label="자동 선택 (추천)"
            sub="기기에서 가장 좋은 음성을 자동으로 골라요"
            checked={selected === null}
            onSelect={() => onChoose(lang, null)}
          />
          {voices.map((v) => {
            const q = voiceQuality(v);
            const state = preview[v.voiceURI];
            const failed =
              state === "fail" || (state === undefined && isVoiceBroken(v.voiceURI));
            const parts = [
              q ? QUALITY_LABEL[q] : null,
              v.localService ? "기기 내장" : "온라인",
            ].filter(Boolean);
            return (
              <VoiceRow
                key={v.voiceURI}
                label={q ? `${v.name} (${QUALITY_LABEL[q]})` : v.name}
                sub={
                  failed
                    ? "⚠️ 이 브라우저에서 소리가 나지 않아요"
                    : state === "playing"
                      ? "재생 중…"
                      : parts.join(" · ")
                }
                warn={failed}
                checked={selected === v.voiceURI}
                onSelect={() => onChoose(lang, v.voiceURI)}
                onPreview={() => onPreview(v, lang)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function VoiceRow({
  label,
  sub,
  checked,
  warn = false,
  onSelect,
  onPreview,
}: {
  label: string;
  sub: string;
  checked: boolean;
  warn?: boolean;
  onSelect: () => void;
  onPreview?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-3 last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            checked
              ? "border-indigo-500 bg-indigo-500"
              : "border-foreground/25"
          }`}
          aria-hidden
        >
          {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{label}</span>
          <span
            className={`block text-[11px] ${
              warn ? "text-amber-600 dark:text-amber-400" : "text-muted"
            }`}
          >
            {sub}
          </span>
        </span>
      </button>
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          aria-label="미리듣기"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 transition active:scale-90 dark:text-indigo-400"
        >
          🔊
        </button>
      )}
    </div>
  );
}
