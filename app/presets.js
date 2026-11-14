/* MarketingMonk industry presets. One click sets up the pipeline, Monk AI
   qualifier, follow-up sequences, booking page and lead labels for a trade. */
(() => {
  'use strict';
  const PTFE = {
    id: 'ptfe',
    name: 'PTFE manufacturer',
    icon: '🏭',
    blurb: 'For PTFE and engineering-plastics makers. RFQ pipeline, a WhatsApp qualifier that collects product, grade, size and quantity, and quotation follow-ups.',
    stages: ['New enquiry', 'Qualified RFQ', 'Sample sent', 'Quotation sent', 'Negotiation', 'Won – PO received', 'Lost'],
    labels: {
      interest: ['Product / grade / size', 'PTFE sheet, virgin, 3 mm'],
      budget: ['Quantity', '200 kg, monthly'],
      timeline: ['Delivery needed', 'Within 2 weeks, Pune'],
      value: 'Order value (₹)',
    },
    agent: {
      about: 'We manufacture PTFE (Teflon) products: sheets, rods, tubes, bushes, gaskets, bellows, tapes and custom machined parts, in virgin and filled grades (glass, carbon, bronze). Test certificates on request.',
      greeting: 'Namaste! 🙏 Thanks for contacting {business}. Share a few details and we will send you a quotation quickly.',
      questions: [
        { key: 'interest', label: 'Product', question: 'Which PTFE product do you need? Sheets, rods, tubes, bushes, gaskets, bellows, tape, or a machined part?' },
        { key: 'grade', label: 'Grade', question: 'Which grade? Virgin, reprocessed, or filled (glass, carbon, bronze)? If you can, mention the application too.' },
        { key: 'size', label: 'Size', question: 'What size? Thickness × width × length, or OD × ID × length. You can also send the drawing here.' },
        { key: 'quantity', label: 'Quantity', question: 'How much do you need (pieces or kg)? Is it a one-time order or a regular requirement?' },
        { key: 'timeline', label: 'Delivery', question: 'When do you need delivery, and to which city?' },
        { key: 'company', label: 'Company & GST', question: 'Last one: your company name and GST number, for the quotation?' },
      ],
      hot_words: 'urgent, immediately, asap, this week, po ready, purchase order, regular, monthly, every month, bulk, tender, approved vendor, ready to order, breakdown, shutdown',
      cold_words: 'just checking, rate only, price only, student, college project, not now, later, maybe, next year, just looking',
      handoff_hot: 'Thank you! {rep} from our sales team will call you shortly with pricing. 📞',
      handoff_other: 'Thank you! Our team is preparing your quotation and will share it here soon.',
    },
    sequences: [
      { name: 'Quotation follow-up', stop_on_reply: true, steps: [
        { delay_days: 0, body: 'Hi {name}, here is our quotation for your PTFE requirement. Prices are valid for 15 days. If the size or quantity changes, just reply here.' },
        { delay_days: 2, body: 'Hi {name}, did you get a chance to review the quotation? We can adjust the grade or quantity to fit your budget.' },
        { delay_days: 5, body: '{name}, we can send a sample or a material test certificate before you place the order. Shall we?' },
        { delay_days: 10, body: 'Final follow-up from {business}, {name}. If this order is on hold, reply "later" and we will check back next month. For a quick technical call: {booking_link}' },
      ] },
      { name: 'Sample feedback', stop_on_reply: true, steps: [
        { delay_days: 3, body: 'Hi {name}, has the PTFE sample reached you? Let us know once your team has tested it.' },
        { delay_days: 7, body: 'Hi {name}, any feedback on the sample? If it passed, we can send the final quotation today.' },
      ] },
      { name: 'Repeat order reminder', stop_on_reply: true, steps: [
        { delay_days: 30, body: 'Hi {name}, {business} here. Is it time to plan your next PTFE order? Reply with the quantity and we will quote the same day.' },
        { delay_days: 60, body: 'Hi {name}, checking in on your PTFE stock. We can also hold material for scheduled monthly dispatches.' },
      ] },
    ],
    booking: { title: 'Technical discussion', note: 'A short call to go over your drawing, grade and quantity.', slot_minutes: 30 },
    // Demo-only sample leads (fictional companies) so the board looks like a real PTFE desk.
    samples: [
      ['Rohit Deshmukh · Deshmukh Valves', '+919800000101', 'IndiaMART', 'hot', 1, 'PTFE gaskets · virgin · 4" ANSI', '500 pcs, monthly', 'This week, Pune', 85000],
      ['Sana Qureshi · Qureshi Pharma Equip', '+919800000102', 'Website', 'warm', 2, 'PTFE bellows · virgin · DN50', '20 pcs', '3 weeks, Hyderabad', 64000],
      ['Manjunath B · Sri Sai Engineering', '+919800000103', 'WhatsApp', 'hot', 3, 'Glass-filled PTFE rod · 25% GF · 60 mm', '150 kg', 'Within 10 days, Hubballi', 210000],
      ['Deepa Nair · Kerala Chemicals', '+919800000104', 'TradeIndia', 'cold', 0, 'PTFE sheet · 3 mm', 'Not sure', 'Just checking rates', 0],
      ['Imran Patel · Patel Hydraulics', '+919800000105', 'Referral', 'warm', 4, 'Bronze-filled PTFE bushes · drawing shared', '1,000 pcs', 'Next month, Ahmedabad', 140000],
    ],
  };

  const REALESTATE = { id: 'realestate', name: 'Real estate agent', icon: '🏠', soon: true, blurb: 'Site-visit pipeline and a buyer qualifier for budget, BHK, area and timeline. Coming next.' };

  window.MMPresets = { list: [PTFE, REALESTATE], byId: { ptfe: PTFE, realestate: REALESTATE } };
})();
