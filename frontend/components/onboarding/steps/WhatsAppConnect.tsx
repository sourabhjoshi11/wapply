'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { whatsappApi } from '@/lib/api';

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '';
const META_WASM_CONFIG_ID = process.env.NEXT_PUBLIC_META_WASM_CONFIG_ID || '';
const SDK_READY = FB_APP_ID && FB_APP_ID !== 'YOUR_FACEBOOK_APP_ID' && META_WASM_CONFIG_ID;
const USE_EMBEDDED_SIGNUP = !!SDK_READY;

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        cb: (response: { authResponse?: { accessToken: string }; status?: string }) => void,
        opts: Record<string, unknown>,
      ) => void;
      wasmEmbeddedSignup?: (
        configId: string,
        callbacks: {
          onInteractive: (data: Record<string, unknown>) => void;
          onExit: (data: {
            code?: string;
            access_token?: string;
            phone_number_id?: string;
            business_phone?: string;
            status?: string;
          }) => void;
        },
      ) => void;
      getLoginStatus: (cb: (response: { status: string }) => void) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export default function WhatsAppConnect() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const botNumber = useOnboardingStore((s) => s.botNumber);
  const botNumberVerified = useOnboardingStore((s) => s.botNumberVerified);
  const setBotNumber = useOnboardingStore((s) => s.setBotNumber);
  const setBotNumberVerified = useOnboardingStore((s) => s.setBotNumberVerified);
  const nextStep = useOnboardingStore((s) => s.nextStep);

  // Embedded Signup
  const [connecting, setConnecting] = useState(false);
  const [fbSdkLoaded, setFbSdkLoaded] = useState(false);

  // Manual mode (dev fallback)
  const [manualOpen, setManualOpen] = useState(false);
  const [number, setNumber] = useState(botNumber || '');
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');

  // OTP (legacy dev fallback)
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);

  // ── Load Facebook SDK ─────────────────────────────────────────────────
  useEffect(() => {
    if (!USE_EMBEDDED_SIGNUP) return;
    if (document.getElementById('facebook-jssdk')) return;

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: FB_APP_ID,
        version: 'v22.0',
        cookie: true,
      });
      setFbSdkLoaded(true);
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  // ── Embedded Signup: Connect with Meta ────────────────────────────────
  const connectMeta = useCallback(async () => {
    if (!window.FB) {
      toast.error('Facebook SDK not loaded. Check NEXT_PUBLIC_FACEBOOK_APP_ID.');
      return;
    }
    if (!META_WASM_CONFIG_ID) {
      toast.error('Meta WASM config ID not set.');
      return;
    }
    if (!shopId) {
      toast.error('Shop not created yet. Complete previous steps first.');
      return;
    }

    setConnecting(true);

    try {
      // Try wasmEmbeddedSignup (new WABA) first, fall back to FB.login
      if (window.FB.wasmEmbeddedSignup) {
        window.FB.wasmEmbeddedSignup(META_WASM_CONFIG_ID, {
          onInteractive: () => {
            // Popup opened — user is going through Meta flow
          },
          onExit: async (data) => {
            setConnecting(false);
            if (data.status === 'completed' && (data.access_token || data.code)) {
              await saveEmbeddedCredentials(data);
            } else {
              toast.error('WhatsApp connection was not completed.');
            }
          },
        });
      } else {
        // Fallback: FB.login with wasm permission
        window.FB.login(
          async (response) => {
            setConnecting(false);
            if (response.authResponse) {
              await saveEmbeddedCredentials({
                access_token: response.authResponse.accessToken,
              });
            } else {
              toast.error('WhatsApp connection was cancelled.');
            }
          },
          {
            config_id: META_WASM_CONFIG_ID,
            response_type: 'token',
            extras: {
              featureType: 'whatsapp_business_app_onboarding',
              sessionInfoVersion: '3',
              setup: {},
            },
          },
        );
      }
    } catch (err) {
      setConnecting(false);
      toast.error('Facebook SDK error. Use manual entry instead.');
      console.error('Embedded Signup error:', err);
    }
  }, [shopId]);

  const saveEmbeddedCredentials = async (data: {
    access_token?: string;
    code?: string;
    phone_number_id?: string;
    business_phone?: string;
  }) => {
    if (!shopId) return;

    try {
      const payload: {
        shop_id: string;
        access_token: string;
        phone_number_id: string;
        business_phone?: string;
      } = {
        shop_id: shopId,
        access_token: data.access_token || '',
        phone_number_id: data.phone_number_id || '',
      };

      // For FB.login flow, phone_number_id comes from the extras setup callback
      // For wasmEmbeddedSignup, it comes in onExit data
      if (data.business_phone) {
        payload.business_phone = data.business_phone;
        setBotNumber(data.business_phone.replace('+', ''));
      }

      await whatsappApi.register(payload);
      setBotNumberVerified(true);
      toast.success('WhatsApp Business connected! 🎉');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save credentials';
      toast.error(msg);
    }
  };

  // ── Manual entry (dev fallback) ───────────────────────────────────────
  const saveManual = async () => {
    if (!number.match(/^\+91\d{10}$/)) {
      toast.error('Enter a valid 10-digit Indian mobile number with +91');
      return;
    }
    if (!accessToken || !phoneNumberId) {
      toast.error('Access token and Phone Number ID are required');
      return;
    }
    if (!shopId) {
      toast.error('Shop not created yet. Complete previous steps first.');
      return;
    }

    try {
      await whatsappApi.register({
        shop_id: shopId,
        access_token: accessToken,
        phone_number_id: phoneNumberId,
        business_phone: number,
      });
      setBotNumber(number);
      setBotNumberVerified(true);
      toast.success('WhatsApp credentials saved!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(msg);
    }
  };

  // ── OTP flow (legacy dev fallback) ────────────────────────────────────
  const sendOtp = async () => {
    if (!number.match(/^\+91\d{10}$/)) {
      toast.error('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    setSending(true);
    try {
      await whatsappApi.sendOtp(number);
      setOtpSent(true);
      toast.success('OTP sent to ' + number);
    } catch {
      toast.error('Failed to send OTP. Check the number.');
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error('Enter 6-digit OTP');
      return;
    }
    setVerifying(true);
    try {
      await whatsappApi.verifyOtp(number, otp);
      setBotNumber(number);
      setBotNumberVerified(true);
      toast.success('WhatsApp number verified! 🎉');
    } catch {
      toast.error('Invalid OTP. Try again.');
    } finally {
      setVerifying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-white mb-6">
        {t.onboarding.whatsappConnect.title}
      </h2>

      {/* Info card */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-6">
        <p className="text-sm text-blue-300 leading-relaxed">
          {t.onboarding.whatsappConnect.info}
        </p>
      </div>

      {/* ──── Embedded Signup (primary) ──── */}
      {USE_EMBEDDED_SIGNUP && (
        <div className="mb-6 p-6 rounded-xl border border-gray-800 bg-gray-900/50">
          <h3 className="text-lg font-semibold text-white mb-2">
            Connect WhatsApp Business Account
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            Use your Facebook account to connect your WhatsApp Business number.
          </p>

          {botNumberVerified ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20"
            >
              <CheckCircle2 className="h-6 w-6 text-green-400 shrink-0" />
              <div>
                <p className="text-green-400 font-medium">
                  WhatsApp Business Connected
                </p>
                <p className="text-sm text-gray-400">
                  {botNumber || 'Phone number registered'}
                </p>
              </div>
            </motion.div>
          ) : (
            <Button
              onClick={connectMeta}
              disabled={connecting || !fbSdkLoaded}
              size="lg"
              className="w-full bg-[#1877F2] hover:bg-[#166fe5] text-white"
            >
              {connecting ? (
                <>
              <svg className="h-5 w-5 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Connecting...
                </>
              ) : !fbSdkLoaded ? (
                <>
              <svg className="h-5 w-5 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading Meta SDK...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Connect with Facebook
                </>
              )}
            </Button>
          )}

          {!botNumberVerified && (
            <p className="text-xs text-gray-500 mt-3 text-center">
              Opens a Facebook login popup to connect your WhatsApp Business account.
            </p>
          )}
        </div>
      )}

      {/* ──── Manual / Dev fallback ──── */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
        <button
          onClick={() => setManualOpen(!manualOpen)}
          className="w-full flex items-center justify-between p-4 text-sm text-gray-300 hover:text-white transition-colors"
        >
          <span>
            {USE_EMBEDDED_SIGNUP
              ? 'Or enter credentials manually'
              : 'Connect your WhatsApp Business number'}
          </span>
          {manualOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <AnimatePresence>
          {manualOpen && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                {/* Phone number */}
                <div className="space-y-1">
                  <Label>WhatsApp Business Number</Label>
                  <PhoneInput
                    value={number}
                    onChange={setNumber}
                    placeholder="+91XXXXXXXXXX"
                    disabled={botNumberVerified}
                  />
                </div>

                {/* Access token */}
                <div className="space-y-1">
                  <Label>Access Token</Label>
                  <Input
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Paste your WhatsApp access token"
                    disabled={botNumberVerified}
                    className="font-mono text-xs"
                  />
                </div>

                {/* Phone number ID */}
                <div className="space-y-1">
                  <Label>Phone Number ID</Label>
                  <Input
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="Paste your phone number ID"
                    disabled={botNumberVerified}
                  />
                </div>

                {!botNumberVerified ? (
                  <Button onClick={saveManual} size="lg" className="w-full">
                    Save Credentials
                  </Button>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20"
                  >
                    <CheckCircle2 className="h-6 w-6 text-green-400 shrink-0" />
                    <div>
                      <p className="text-green-400 font-medium">Connected</p>
                      <p className="text-sm text-gray-400">{number}</p>
                    </div>
                  </motion.div>
                )}

                {/* Divider / OTP fallback (only when no Embedded Signup) */}
                {!USE_EMBEDDED_SIGNUP && !botNumberVerified && (
                  <div className="border-t border-gray-800 pt-4">
                    <p className="text-sm text-gray-400 mb-3">
                      Or verify via OTP (dev mode):
                    </p>

                    <div className="flex gap-2">
                      <Button
                        onClick={sendOtp}
                        disabled={sending || number.length < 13}
                        variant="outline"
                        size="sm"
                      >
                        {sending ? '...' : 'Send OTP'}
                      </Button>
                    </div>

                    <AnimatePresence>
                      {otpSent && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 space-y-1"
                        >
                          <Label>OTP</Label>
                          <div className="flex gap-2">
                            <Input
                              value={otp}
                              onChange={(e) =>
                                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                              }
                              placeholder="000000"
                              maxLength={6}
                              className="max-w-[160px] text-center text-lg tracking-widest"
                            />
                            <Button onClick={verifyOtp} disabled={verifying} size="sm">
                              {verifying ? '...' : 'Verify'}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Help accordion */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-8">
        <button
          onClick={() => setHelpOpen(!helpOpen)}
          className="w-full flex items-center justify-between p-4 text-sm text-gray-300 hover:text-white transition-colors"
        >
          <span>{t.onboarding.whatsappConnect.helpTitle}</span>
          {helpOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <AnimatePresence>
          {helpOpen && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-2">
                {t.onboarding.whatsappConnect.helpSteps.map(
                  (step: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm text-gray-400"
                    >
                      <span className="text-[#25D366] font-bold mt-0.5">
                        {i + 1}.
                      </span>
                      <span>{step}</span>
                    </div>
                  ),
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Next step */}
      <div className="flex justify-end">
        <Button onClick={nextStep} disabled={!botNumberVerified} size="lg">
          {t.onboarding.catalogSetup.proceed}
        </Button>
      </div>
    </motion.div>
  );
}
