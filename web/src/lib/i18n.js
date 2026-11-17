// Telugu menus & labels. English text is the key; anything not in the list stays English.
const KEY = 'bm_lang';
export const lang = (() => { try { return localStorage.getItem(KEY) || 'en'; } catch { return 'en'; } })();
export const setLang = (l) => { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } window.location.reload(); };

const TE = {
  Dashboard: 'డాష్‌బోర్డ్', '⚡ Send Bill': '⚡ బిల్ పంపండి', '🧾 POS Counter': '🧾 కౌంటర్ బిల్లింగ్',
  'Sales & Customers': 'అమ్మకాలు & కస్టమర్లు', Marketing: 'మార్కెటింగ్', Accounts: 'ఖాతాలు', Operations: 'స్టాక్ & కొనుగోళ్లు',
  'HR & Staff': 'సిబ్బంది', 'R&D': 'ఆర్ & డి', Reports: 'రిపోర్టులు', Admin: 'అడ్మిన్', 'Online Shop': 'ఆన్‌లైన్ షాప్',
  '⭐ Memberships': '⭐ మెంబర్‌షిప్‌లు', 'Staff & Roles': 'స్టాఫ్ & రోల్స్', Settings: 'సెట్టింగ్స్', Logout: 'లాగౌట్', 'Log out': 'లాగౌట్',
  'Online Orders': 'ఆన్‌లైన్ ఆర్డర్లు', 'Leads Pipeline': 'లీడ్స్', Customers: 'కస్టమర్లు', 'Follow-ups': 'ఫాలో-అప్‌లు',
  Quotations: 'కొటేషన్లు', Invoices: 'ఇన్వాయిస్‌లు', Returns: 'రిటర్న్స్', 'Items & Services': 'ఐటమ్స్ & సర్వీసులు',
  Overview: 'సారాంశం', Expenses: 'ఖర్చులు', 'Day Book': 'డే బుక్', 'P&L · GST · Cash flow': 'లాభనష్టాలు · GST · నగదు',
  Stock: 'స్టాక్', Purchases: 'కొనుగోళ్లు', 'Purchase Returns': 'కొనుగోలు రిటర్న్స్', Suppliers: 'సప్లయర్లు', 'Barcode Labels': 'బార్‌కోడ్ లేబుల్స్',
  Campaigns: 'క్యాంపెయిన్లు', Coupons: 'కూపన్లు', 'Birthday Wishes': 'పుట్టినరోజు శుభాకాంక్షలు',
  Attendance: 'హాజరు', Salary: 'జీతాలు', Employees: 'ఉద్యోగులు',
  'Total sales': 'మొత్తం అమ్మకాలు', Collected: 'వసూలైంది', 'Average bill': 'సగటు బిల్', 'Total pending (all time)': 'మొత్తం బాకీ',
  'Items tracked': 'ట్రాక్ చేస్తున్న ఐటమ్స్', 'Stock value (cost)': 'స్టాక్ విలువ', 'Low stock': 'తక్కువ స్టాక్',
  'Sales (before GST)': 'అమ్మకాలు (GST ముందు)', 'Gross profit': 'లాభం', 'Items sold': 'అమ్మిన ఐటమ్స్',
  Name: 'పేరు', Mobile: 'మొబైల్', Date: 'తేదీ', Category: 'వర్గం', Amount: 'మొత్తం', Notes: 'నోట్స్', Quantity: 'పరిమాణం',
  Price: 'ధర', Unit: 'యూనిట్', Supplier: 'సప్లయర్', Address: 'చిరునామా', Birthday: 'పుట్టినరోజు', Role: 'పని',
  'Paid via': 'చెల్లింపు విధానం', Mode: 'విధానం', 'Discount ₹': 'డిస్కౌంట్ ₹', Title: 'శీర్షిక', Message: 'సందేశం',
  'Today': 'ఈరోజు', 'This month': 'ఈ నెల',
};

export const t = (s) => (lang === 'te' && typeof s === 'string' && TE[s]) || s;
