import { NextRequest, NextResponse } from 'next/server';

const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount } = body;

    if (!amount || amount < 10) {
      return NextResponse.json(
        { error: 'Invalid amount (min ₹10)' },
        { status: 400 },
      );
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      // If Razorpay is not configured, return a mock order for development
      return NextResponse.json({
        order_id: `order_dev_${Date.now()}`,
        amount: amount * 100,
        currency: 'INR',
        _note: 'Razorpay not configured - dev mode',
      });
    }

    const auth = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`,
    ).toString('base64');

    const response = await fetch(
      'https://api.razorpay.com/v1/orders',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: amount * 100, // Razorpay expects paise
          currency: 'INR',
          receipt: `wapply_${Date.now()}`,
          notes: {
            type: 'wallet_recharge',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Razorpay error:', errorText);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 },
      );
    }

    const order = await response.json();
    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error('Recharge API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
