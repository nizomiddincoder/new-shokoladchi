import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, Loader2, SwitchCamera, X } from 'lucide-react';
import { haptic } from './telegram';

export const cameraSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Ilova ichidagi kamera. Telegram (ayniqsa Desktop va ba'zi Android versiyalari)
 * <input capture> ni e'tiborsiz qoldirib galereyani ochadi, shuning uchun kamerani to'g'ridan-to'g'ri ochamiz.
 * Kamera ishlamasa — galereyadan tanlash tugmasi ko'rsatiladi.
 */
export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (file: File) => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [state, setState] = useState<'starting' | 'ready' | 'error'>('starting');
  const [hasMultiple, setHasMultiple] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState('starting');
    (async () => {
      try {
        if (!cameraSupported()) throw new Error('unsupported');
        stop();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState('ready');
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setHasMultiple(devices.filter((d) => d.kind === 'videoinput').length > 1);
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const close = () => {
    stop();
    onClose();
  };

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    haptic('medium');
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stop();
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="flex items-center justify-between p-3" style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        <button onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white" aria-label={t('common.close')}>
          <X className="h-6 w-6" />
        </button>
        {hasMultiple && state === 'ready' && (
          <button
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="switch camera"
          >
            <SwitchCamera className="h-6 w-6" />
          </button>
        )}
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-contain" />
        {state === 'starting' && <Loader2 className="absolute h-10 w-10 animate-spin text-white" />}
        {state === 'error' && (
          <div className="absolute inset-x-6 rounded-2xl bg-white p-5 text-center">
            <Camera className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-[14px] font-semibold text-ink">{t('camera.unavailable')}</p>
            <p className="mt-1 text-[12.5px] text-muted">{t('camera.unavailableHint')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  onCapture(f);
                  onClose();
                }
              }}
            />
            <button onClick={() => fileRef.current?.click()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-[14px] font-semibold text-white">
              <ImagePlus className="h-[18px] w-[18px]" /> {t('camera.pickFile')}
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center p-6" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
        <button
          onClick={shoot}
          disabled={state !== 'ready'}
          aria-label={t('camera.shoot')}
          className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white/80 disabled:opacity-40"
        >
          <span className="h-[58px] w-[58px] rounded-full bg-white active:scale-90" />
        </button>
      </div>
    </div>
  );
}
