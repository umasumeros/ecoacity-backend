// server.js - Main Backend Server
const express = require('express');
require('dotenv').config();
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ADD SUPABASE
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// EXPRESS APP SETUP
const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    'https://ecoacity.com',
    'https://www.ecoacity.com',
    'https://ecoacity.com/your-folder-name',  // Add your actual folder path
    'https://www.ecoacity.com/your-folder-name'
  ],
  credentials: true
}));

// Homepage ROI Calculation Endpoint
app.post('/api/calculate-roi', (req, res) => {
  try {
    const { businessType, contactsSize, plan, redemptionRate, averageOrderValue, offerValue } = req.body;
    
    // Plan configurations
    const planConfigs = {
      basic: { price: 99, campaigns: 2, contacts: 250 },
      standard: { price: 139, campaigns: 4, contacts: 500 }
    };
    
    const config = planConfigs[plan];
    const campaignsPerMonth = config.campaigns;
    const contactsPerCampaign = Math.min(contactsSize, config.contacts);
    
    // ROI Calculations
    const totalContactsReached = campaignsPerMonth * contactsPerCampaign;
    const baseRedemptions = totalContactsReached * (redemptionRate / 100);
    const optimizationBoost = 1.25; // 25% professional improvement
    const totalRedemptions = baseRedemptions * optimizationBoost;
    
    const grossSales = totalRedemptions * averageOrderValue;
    const offerCosts = totalRedemptions * offerValue;
    const campaignCosts = campaignsPerMonth * 20; // $20 per campaign
    const subscriptionCost = config.price;
    const totalExpenses = offerCosts + campaignCosts + subscriptionCost;
    const monthlyProfit = grossSales - totalExpenses;
    const roi = totalExpenses > 0 ? ((grossSales - totalExpenses) / totalExpenses) * 100 : 0;
    
    // Annual projections
    const annualProfit = monthlyProfit * 12 * 1.15; // 15% growth factor
    const newCustomersPerMonth = totalRedemptions * 0.35;
    const paybackMonths = monthlyProfit > 0 ? subscriptionCost / monthlyProfit : 0;
    
    res.json({
      monthly: {
        contactsReached: totalContactsReached,
        redemptions: Math.round(totalRedemptions),
        grossSales: Math.round(grossSales),
        totalExpenses: Math.round(totalExpenses),
        profit: Math.round(monthlyProfit),
        roi: Math.round(roi)
      },
      annual: {
        profit: Math.round(annualProfit)
      },
      growth: {
        newCustomersPerMonth: Math.round(newCustomersPerMonth),
        paybackMonths: Math.round(paybackMonths * 10) / 10
      }
    });
  } catch (error) {
    console.error('ROI calculation error:', error);
    res.status(500).json({ error: 'Calculation failed' });
  }
});

// Pre-launch Signup Endpoint
app.post('/api/prelaunch-signup', async (req, res) => {
  console.log('🔥 API ENDPOINT HIT! /api/prelaunch-signup');
  console.log('📨 Request body:', req.body);
  console.log('📋 Request headers:', req.headers);
  
  try {
    const { 
      email, 
      business,
      plan, 
      projectedProfit
    } = req.body;
    
    console.log('📊 Extracted data:', { email, business, plan, projectedProfit });
    
    // Save to Supabase database
   const signupData = {
  business_name: business,
  owner_name: business,
  email: email,
  plan_type: plan.charAt(0).toUpperCase() + plan.slice(1),
  subscription_amount: projectedProfit ? projectedProfit.replace(/[$,]/g, '') : projectedProfit,
  status: 'Pre-Launch'
};

    console.log('💾 Data to save:', signupData);

    const { data, error } = await supabase
      .from('subscribers')
      .insert([signupData])
      .select();
    
    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save signup data',
        details: error.message 
      });
    }

    console.log('✅ Successfully saved signup:', data[0]);
    
    res.json({ 
      success: true, 
      data: data[0],
      message: 'Pre-launch signup successful!' 
    });

  } catch (error) {
    console.error('💥 Signup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Save ROI Calculation (for email capture)
app.post('/api/save-calculation', (req, res) => {
  try {
    const { email, businessType, results, plan } = req.body;
    
    const savedCalculation = {
      id: `calc_${Date.now()}`,
      email,
      businessType,
      plan,
      monthlyProfit: results.monthly.profit,
      annualProfit: results.annual.profit,
      roi: results.monthly.roi,
      savedDate: new Date().toISOString()
    };
    
    // Store calculation (replace with AirTable later)
    console.log('Saved calculation:', savedCalculation);
    
    res.json({
      success: true,
      message: 'Calculation saved! Check your email.',
      downloadUrl: `/calculations/${savedCalculation.id}` // Future: PDF generation
    });
    
  } catch (error) {
    console.error('Save calculation error:', error);
    res.status(500).json({ error: 'Failed to save calculation' });
  }
});

// Get business type presets
app.get('/api/business-presets', (req, res) => {
  const presets = {
    coffee: { name: 'Coffee Shop', aov: 11.45, offer: 2.29, redemption: 12 },
    restaurant: { name: 'Restaurant', aov: 28.50, offer: 8.50, redemption: 15 },
    retail: { name: 'Retail Store', aov: 45.00, offer: 15.00, redemption: 8 },
    salon: { name: 'Salon/Spa', aov: 75.00, offer: 25.00, redemption: 18 },
    fitness: { name: 'Fitness Studio', aov: 35.00, offer: 12.00, redemption: 22 },
    auto: { name: 'Auto Service', aov: 125.00, offer: 35.00, redemption: 6 }
  };
  
  res.json(presets);
});

// Pre-launch pricing endpoint
app.get('/api/pricing', (req, res) => {
  const pricing = {
    basic: {
      monthly: 99,
      annual: 1188,
      regularAnnual: 1308,
      savings: 120,
      features: ['Bi-monthly SMS', 'Weekly Email', 'Basic Analytics', 'Profit Krewe Access']
    },
    standard: {
      monthly: 139,
      annual: 1428,
      regularAnnual: 1668,
      savings: 240,
      features: ['Weekly SMS', 'Weekly Email', 'Monthly Summit', 'Advanced Analytics', 'Priority Support']
    }
  };
  
  res.json(pricing);
});

console.log('📊 Homepage API endpoints added successfully!');

// Mock Airtable (we'll replace with real Airtable API later)
let businesses = [
  { id: 'biz_001', name: 'Coffee Shop Alpha', cashbackBalance: 0, email: 'alpha@coffee.com' },
  { id: 'biz_002', name: 'Design Studio Beta', cashbackBalance: 0, email: 'beta@design.com' },
  { id: 'biz_003', name: 'Restaurant Gamma', cashbackBalance: 0, email: 'gamma@restaurant.com' }
];

let transactions = [];

// CORE BUSINESS LOGIC - This is where the magic happens!
function calculateCashback(amount) {
  return Math.round(amount * 0.015); // 1.5% cashback in cents
}

// API ENDPOINTS

// 1. Get all businesses in the network
app.get('/api/businesses', (req, res) => {
  res.json(businesses);
});

// 2. Process a B2B transaction with cashback
app.post('/api/process-transaction', async (req, res) => {
  try {
    const { buyerId, sellerId, amount, description } = req.body;
    
    // Find buyer and seller
    const buyer = businesses.find(b => b.id === buyerId);
    const seller = businesses.find(b => b.id === sellerId);
    
    if (!buyer || !seller) {
      return res.status(400).json({ error: 'Business not found' });
    }

    // Create Stripe payment intent (this connects to your existing Stripe)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // amount in cents
      currency: 'usd',
      metadata: {
        buyer_id: buyerId,
        seller_id: sellerId,
        description: description
      }
    });

    // Calculate cashback
    const cashbackAmount = calculateCashback(amount);
    
    // Record transaction
    const transaction = {
      id: `txn_${Date.now()}`,
      buyerId,
      sellerId,
      amount,
      cashbackAmount,
      description,
      timestamp: new Date().toISOString(),
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending'
    };
    
    transactions.push(transaction);

    res.json({
      success: true,
      transaction,
      paymentIntent: {
        client_secret: paymentIntent.client_secret,
        id: paymentIntent.id
      },
      cashbackAmount
    });

  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

// 3. Confirm transaction and apply cashback (called after Stripe confirms payment)
app.post('/api/confirm-cashback', (req, res) => {
  const { transactionId } = req.body;
  
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(400).json({ error: 'Transaction not found' });
  }

  // Apply cashback to buyer's account
  const buyer = businesses.find(b => b.id === transaction.buyerId);
  buyer.cashbackBalance += transaction.cashbackAmount;
  
  // Update transaction status
  transaction.status = 'completed';

  res.json({
    success: true,
    message: `$${(transaction.cashbackAmount / 100).toFixed(2)} cashback applied to ${buyer.name}`,
    newBalance: buyer.cashbackBalance
  });
});

// 4. Get business dashboard data
app.get('/api/business/:id/dashboard', (req, res) => {
  const business = businesses.find(b => b.id === req.params.id);
  if (!business) {
    return res.status(404).json({ error: 'Business not found' });
  }

  const businessTransactions = transactions.filter(
    t => t.buyerId === req.params.id || t.sellerId === req.params.id
  );

  const totalEarned = businessTransactions
    .filter(t => t.buyerId === req.params.id && t.status === 'completed')
    .reduce((sum, t) => sum + t.cashbackAmount, 0);

  const totalSpent = businessTransactions
    .filter(t => t.buyerId === req.params.id && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  res.json({
    business,
    stats: {
      totalEarned,
      totalSpent,
      transactionCount: businessTransactions.length,
      cashbackBalance: business.cashbackBalance
    },
    recentTransactions: businessTransactions.slice(-10)
  });
});

// 5. Webhook to handle Stripe events (this is crucial!)
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const transactionId = transactions.find(t => t.stripePaymentIntentId === paymentIntent.id)?.id;
    
    if (transactionId) {
      // Auto-confirm cashback when payment succeeds
      const transaction = transactions.find(t => t.id === transactionId);
      const buyer = businesses.find(b => b.id === transaction.buyerId);
      buyer.cashbackBalance += transaction.cashbackAmount;
      transaction.status = 'completed';
      
      console.log(`Cashback applied: $${transaction.cashbackAmount/100} to ${buyer.name}`);
    }
  }

  res.json({received: true});
});

// Simple working endpoint for testing
app.post('/api/simple-test', (req, res) => {
  console.log('🟢 Simple test endpoint hit!');
  console.log('Body received:', req.body);
  res.json({ success: true, message: 'Simple test works!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Cashback API running on port ${PORT}`);
  console.log(`💳 Ready to process B2B transactions with 1.5% cashback!`);
});
