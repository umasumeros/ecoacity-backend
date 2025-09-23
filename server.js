// server.js - Supabase-Integrated Cashback Backend
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for backend operations
);

// In-memory transaction storage (consider moving to Supabase table later)
let transactions = [];

// CORE BUSINESS LOGIC
function calculateCashback(amount) {
  return Math.round(amount * 0.015); // 1.5% cashback in cents
}

// API ENDPOINTS

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. Get all active businesses in the network
app.get('/api/businesses', async (req, res) => {
  try {
    const { data: businesses, error } = await supabase
      .from('subscribers')
      .select('id, business_name, owner_name, email, status, business_category, parish, neighborhood')
      .eq('status', 'active'); // Only active subscribers
    
    if (error) throw error;

    // Transform to match cashback system expectations
    const transformedBusinesses = businesses.map(sub => ({
      id: sub.id,
      name: sub.business_name,
      email: sub.email,
      category: sub.business_category,
      location: `${sub.neighborhood || ''}, ${sub.parish || 'Orleans Parish'}`.trim(),
      cashbackBalance: 0, // Will be calculated from transactions
      owner: sub.owner_name
    }));

    res.json(transformedBusinesses);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// 2. Get specific business by ID
app.get('/api/business/:id', async (req, res) => {
  try {
    const { data: business, error } = await supabase
      .from('subscribers')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'active')
      .single();
    
    if (error || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Calculate cashback balance from transactions
    const businessTransactions = transactions.filter(
      t => t.buyerId === req.params.id && t.status === 'completed'
    );
    const cashbackBalance = businessTransactions.reduce((sum, t) => sum + t.cashbackAmount, 0);

    const transformedBusiness = {
      id: business.id,
      name: business.business_name,
      email: business.email,
      category: business.business_category,
      location: `${business.neighborhood || ''}, ${business.parish || 'Orleans Parish'}`.trim(),
      cashbackBalance,
      owner: business.owner_name,
      planType: business.plan_type,
      joinDate: business.created_at
    };

    res.json(transformedBusiness);
  } catch (error) {
    console.error('Error fetching business:', error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

// 3. Process a B2B transaction with cashback
app.post('/api/process-transaction', async (req, res) => {
  try {
    const { buyerId, sellerId, amount, description } = req.body;
    
    // Verify both businesses exist and are active
    const { data: buyer, error: buyerError } = await supabase
      .from('subscribers')
      .select('id, business_name, email')
      .eq('id', buyerId)
      .eq('status', 'active')
      .single();

    const { data: seller, error: sellerError } = await supabase
      .from('subscribers')
      .select('id, business_name, email')
      .eq('id', sellerId)
      .eq('status', 'active')
      .single();

    if (buyerError || sellerError || !buyer || !seller) {
      return res.status(400).json({ error: 'One or both businesses not found or inactive' });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // amount in cents
      currency: 'usd',
      metadata: {
        buyer_id: buyerId,
        seller_id: sellerId,
        buyer_name: buyer.business_name,
        seller_name: seller.business_name,
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
      buyerName: buyer.business_name,
      sellerName: seller.business_name,
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
      cashbackAmount,
      cashbackPercentage: '1.5%'
    });

  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

// 4. Confirm transaction and apply cashback (called after Stripe confirms payment)
app.post('/api/confirm-cashback', (req, res) => {
  const { transactionId } = req.body;
  
  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(400).json({ error: 'Transaction not found' });
  }

  // Update transaction status
  transaction.status = 'completed';

  res.json({
    success: true,
    message: `$${(transaction.cashbackAmount / 100).toFixed(2)} cashback applied to ${transaction.buyerName}`,
    transaction
  });
});

// 5. Get business dashboard data
app.get('/api/business/:id/dashboard', async (req, res) => {
  try {
    // Get business info from Supabase
    const { data: business, error } = await supabase
      .from('subscribers')
      .select('*')
      .eq('id', req.params.id)
      .eq('status', 'active')
      .single();
    
    if (error || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get transactions for this business
    const businessTransactions = transactions.filter(
      t => t.buyerId === req.params.id || t.sellerId === req.params.id
    );

    const completedTransactions = businessTransactions.filter(t => t.status === 'completed');

    const totalEarned = completedTransactions
      .filter(t => t.buyerId === req.params.id)
      .reduce((sum, t) => sum + t.cashbackAmount, 0);

    const totalSpent = completedTransactions
      .filter(t => t.buyerId === req.params.id)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalReceived = completedTransactions
      .filter(t => t.sellerId === req.params.id)
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      business: {
        id: business.id,
        name: business.business_name,
        email: business.email,
        category: business.business_category,
        location: `${business.neighborhood || ''}, ${business.parish || 'Orleans Parish'}`.trim(),
        planType: business.plan_type,
        joinDate: business.created_at
      },
      stats: {
        totalCashbackEarned: totalEarned,
        totalSpent,
        totalReceived,
        transactionCount: businessTransactions.length,
        cashbackBalance: totalEarned,
        savingsRate: totalSpent > 0 ? ((totalEarned / totalSpent) * 100).toFixed(2) + '%' : '0%'
      },
      recentTransactions: businessTransactions.slice(-10).reverse()
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// 6. Get network statistics (for admin/demo purposes)
app.get('/api/network-stats', async (req, res) => {
  try {
    const { data: activeBusinesses, error } = await supabase
      .from('subscribers')
      .select('id')
      .eq('status', 'active');
    
    if (error) throw error;

    const completedTransactions = transactions.filter(t => t.status === 'completed');
    const totalVolume = completedTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalCashback = completedTransactions.reduce((sum, t) => sum + t.cashbackAmount, 0);

    res.json({
      activeBusinesses: activeBusinesses.length,
      totalTransactions: completedTransactions.length,
      totalVolume,
      totalCashbackDistributed: totalCashback,
      averageTransaction: completedTransactions.length > 0 ? Math.round(totalVolume / completedTransactions.length) : 0
    });

  } catch (error) {
    console.error('Network stats error:', error);
    res.status(500).json({ error: 'Failed to load network statistics' });
  }
});

// 7. Webhook to handle Stripe events
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
    const transaction = transactions.find(t => t.stripePaymentIntentId === paymentIntent.id);
    
    if (transaction) {
      // Auto-confirm cashback when payment succeeds
      transaction.status = 'completed';
      
      console.log(`Cashback applied: $${transaction.cashbackAmount/100} to ${transaction.buyerName}`);
      console.log(`Transaction completed: ${transaction.buyerName} → ${transaction.sellerName}`);
    }
  }

  res.json({received: true});
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Cashback API running on port ${PORT}`);
  console.log(`💳 Ready to process B2B transactions with 1.5% cashback!`);
  console.log(`🔗 Connected to Supabase for business data`);
});

module.exports = app;
