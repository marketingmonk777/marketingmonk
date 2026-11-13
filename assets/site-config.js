/* MarketingMonk site settings: connects the contact form on the homepage to your CRM.
   Fill these in once your Supabase project is ready. The publishable key is safe to be public
   (row-level security protects your data). NEVER put a secret / service_role key here. */
window.MM_SITE = {
  supabaseUrl: '',          // e.g. 'https://abcd1234.supabase.co'
  publishableKey: '',       // e.g. 'sb_publishable_...'
  handle: 'marketingmonk',  // your booking-page handle from Bookings in the app
  fallbackEmail: 'marketingmonk777@gmail.com' // used until the two values above are set
};
