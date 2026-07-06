export interface Translation {
  nav: {
    features: string;
    pricing: string;
    howItWorks: string;
    startNow: string;
    dashboard: string;
    login: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    description: string;
    ctaPrimary: string;
    ctaSecondary: string;
    chatMessages: Array<{ text: string; sender: string; delay: number }>;
    chatBotName: string;
    chatBotStatus: string;
    chatPlaceholder: string;
    chatBadge: string;
  };
  features: {
    title: string;
    subtitle: string;
    items: {
      catalog: { title: string; desc: string };
      restaurant: { title: string; desc: string };
      salon: { title: string; desc: string };
      turf: { title: string; desc: string };
      languages: { title: string; desc: string };
      summary: { title: string; desc: string };
      wallet: { title: string; desc: string };
      noapp: { title: string; desc: string };
    };
  };
  howItWorks: {
    title: string;
    subtitle: string;
    steps: Array<{ title: string; desc: string; time: string }>;
  };
  pricing: {
    title: string;
    subtitle: string;
    basic: {
      name: string;
      price: string;
      period: string;
      orders: string;
      batch: string;
      features: string[];
    };
    standard: {
      name: string;
      price: string;
      period: string;
      orders: string;
      batch: string;
      features: string[];
    };
    pro: {
      name: string;
      price: string;
      period: string;
      orders: string;
      batch: string;
      features: string[];
    };
    freeTrial: string;
    popular: string;
  };
  testimonials: {
    title: string;
    items: Array<{ quote: string; name: string; shop: string }>;
  };
  footer: {
    tagline: string;
    privacyPolicy: string;
    terms: string;
    contact: string;
    support: string;
    copyright: string;
  };
  onboarding: {
    stepIndicator: {
      businessType: string;
      basicDetails: string;
      setup: string;
      connect: string;
      recharge: string;
      success: string;
    };
    selectBusinessType: {
      title: string;
      shop: { title: string; desc: string };
      restaurant: { title: string; desc: string };
      salon: { title: string; desc: string };
      turf: { title: string; desc: string };
    };
    basicDetails: {
      title: string;
      ownerName: string;
      ownerNamePlaceholder: string;
      businessName: string;
      businessNamePlaceholder: string;
      category: string;
      city: string;
      cityPlaceholder: string;
      whatsappNumber: string;
      whatsappPlaceholder: string;
      language: string;
      logo: string;
      logoUpload: string;
      submit: string;
      submitting: string;
    };
    catalogSetup: {
      title: string;
      manualTab: string;
      csvTab: string;
      name: string;
      price: string;
      category: string;
      available: string;
      addProduct: string;
      noProducts: string;
      proceed: string;
      downloadTemplate: string;
      dragDrop: string;
      uploadAll: string;
      csvPreview: string;
    };
    menuSetup: {
      title: string;
      name: string;
      price: string;
      category: string;
      veg: string;
      nonVeg: string;
      available: string;
      addItem: string;
    };
    servicesSetup: {
      title: string;
      name: string;
      price: string;
      duration: string;
      description: string;
      addService: string;
    };
    assetsSetup: {
      title: string;
      name: string;
      type: string;
      capacity: string;
      pricePerSlot: string;
      slotDuration: string;
      advancePct: string;
      addAsset: string;
    };
    tablesSetup: {
      title: string;
      question: string;
      count: string;
      generate: string;
      preview: string;
      qrPreview: string;
    };
    staffSetup: {
      title: string;
      name: string;
      active: string;
      addStaff: string;
      days: string;
      startTime: string;
      endTime: string;
      breakStart: string;
      breakEnd: string;
      slotDuration: string;
    };
    workingHours: {
      title: string;
      daysOpen: string;
      openingTime: string;
      closingTime: string;
      slotDuration: string;
      blackoutDates: string;
    };
    whatsappConnect: {
      title: string;
      info: string;
      botNumber: string;
      botPlaceholder: string;
      sendOtp: string;
      otp: string;
      otpPlaceholder: string;
      verify: string;
      verified: string;
      helpTitle: string;
      helpSteps: string[];
    };
    walletRecharge: {
      title: string;
      planSummary: string;
      freeTrial: string;
      afterTrial: string;
      rechargeOptions: string;
      recommended: string;
      custom: string;
      recharge: string;
      note: string;
    };
    success: {
      title: string;
      share: string;
      shareWhatsApp: string;
      downloadQrs: string;
      checklist1: string;
      checklist2: string;
      checklist3: string;
      goToDashboard: string;
    };
  };
  dashboard: {
    overview: string;
    orders: string;
    products: string;
    appointments: string;
    bookings: string;
    customers: string;
    wallet: string;
    billing: string;
    settings: string;
    todayOrders: string;
    todayRevenue: string;
    activeConversations: string;
    walletBalance: string;
    lowBalance: string;
    accept: string;
    cancel: string;
    done: string;
    all: string;
    pending: string;
    accepted: string;
    delivered: string;
    cancelled: string;
    addProduct: string;
    bulkUpload: string;
    search: string;
    filter: string;
    recharge: string;
    dangerZone: string;
    pauseBot: string;
    deleteAccount: string;
    confirmDelete: string;
    logout: string;
    plan: string;
    ordersUsed: string;
    billingHistory: string;
    buyExtras: string;
    upgradePlan: string;
    currentPlan: string;
    monthlyLimit: string;
    extraOrders: string;
    noBillingHistory: string;
  };
  common: {
    loading: string;
    error: string;
    retry: string;
    save: string;
    saving: string;
    delete: string;
    edit: string;
    next: string;
    back: string;
    submit: string;
    cancel: string;
    confirm: string;
    close: string;
    noData: string;
    comingSoon: string;
    language: string;
  };
}
