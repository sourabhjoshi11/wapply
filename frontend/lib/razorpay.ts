interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    contact?: string;
    name?: string;
    email?: string;
  };
  theme: {
    color: string;
  };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal: {
    ondismiss: () => void;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: () => void) => void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function openRazorpayCheckout(options: {
  orderId: string;
  amount: number;
  name: string;
  contact?: string;
  onSuccess: (paymentId: string, orderId: string) => void;
  onDismiss: () => void;
}): void {
  const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  if (!razorpayKey) {
    console.error('Razorpay key not configured');
    return;
  }

  const rzpOptions: RazorpayOptions = {
    key: razorpayKey,
    amount: options.amount * 100, // Razorpay expects paise
    currency: 'INR',
    name: 'Wapply',
    description: options.name,
    order_id: options.orderId,
    prefill: {
      contact: options.contact,
    },
    theme: {
      color: '#25D366',
    },
    handler: (response) => {
      options.onSuccess(
        response.razorpay_payment_id,
        response.razorpay_order_id,
      );
    },
    modal: {
      ondismiss: () => {
        options.onDismiss();
      },
    },
  };

  const razorpay = new window.Razorpay!(rzpOptions);

  razorpay.on('payment.failed', () => {
    options.onDismiss();
  });

  razorpay.open();
}
