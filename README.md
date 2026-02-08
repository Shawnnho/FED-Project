# Singapore Hawker Centre Management System

Front-End Development (FED) Assignment  
Academic Year 2025–2026
Version: 1.0

---

## Project Overview

This project is a front-end web application developed for the Front-End Development (FED) module.  
The application is based on the Singapore Hawker Centre Management System case study provided in the assignment brief.

The system simulates how customers, stall owners, operators, and inspectors interact within a hawker centre environment.  
The focus of this project is on front-end development, responsive design, user interaction, and proper documentation.

---

## Objectives

- Apply HTML, CSS, and JavaScript concepts taught in FED
- Design a responsive and user-friendly web application
- Implement interactive front-end features using JavaScript
- Simulate real-world user flows and use cases
- Practice proper project documentation and version control
- Deploy the project using GitHub Pages

---

## Features


### Guest
-Can see stores and place order without logging in however order details are kept local wont be saved on database


### Customer
- Allowed to use google as login so speed up signup and signin process
- Browse hawker stalls and view stall details
- Browse Promotions
- Filter stalls by cuisine, hygiene grade, and location
- View stall menus and like food items
- Add food items to cart
- Place orders using simulated payment methods
- Track order status
- Submit reviews and complaints
- View feedback and complaint history
- See account details (change email, password, name, phone number)
- ability to save cuisine preference and notification preference
- View current voucher that user might have
- ablity to deactive account if user decide to do so (Account can be reactivated via email link) 

### Stall Owner 
- Display a Dashboard for Stallholder to see Multiple information at once glance
- View incoming orders
- Update order status
- View stall performance analytics
- Access hygiene inspection records
- Edit Account (Email, name, password change, phone number)
- Allowed to edit all Store information
- Ability to Set store to Active state or Inactive State(cant recieve order)
- Notificaiton Preferences
- Recieve Rental bill every month and payment
  
### Operator
- Oversee multiple stalls within a hawker centre
- View analytics and operational data
- Support stall management
- Send rental bills to Stallholders
- View All Stores Rental Agreement 

### Hygiene & Inspection
- Display current hygiene grade
- View historical hygiene inspection results
- Inspection remarks and audit records
- View historical complaints from every stall
- Schedule Inspections for all stores

---
## Role–Permission Matrix

| Feature / Permission | Guest | Customer | Stall Holder | Operator | NEA Officer |
|----------------------|:----:|:--------:|:------------:|:--------:|:-----------:|
| View hawker stalls & menus | ✅ | ✅ | ✅ | ✅ | ✅ |
| Place orders | ✅ (Local only) | ✅ | ❌ | ❌ | ❌ |
| Orders saved to database | ❌ | ✅ | ❌ | ❌ | ❌ |
| Track order status | ❌ | ✅ | ❌ | ❌ | ❌ |
| Submit reviews | ❌ | ✅ | ❌ | ❌ | ❌ |
| Submit complaints | ❌ | ✅ | ❌ | ❌ | ❌ |
| View review & complaint history | ❌ | ✅ | ❌ | ❌ | ✅ |
| View promotions & vouchers | ❌ | ✅ | ❌ | ❌ | ❌ |
| Manage account details | ❌ | ✅ | ✅ | ✅ | ✅ |
| View incoming orders | ❌ | ❌ | ✅ | ❌ | ❌ |
| Update order status | ❌ | ❌ | ✅ | ❌ | ❌ |
| Edit stall information | ❌ | ❌ | ✅ | ❌ | ❌ |
| Activate / deactivate stall | ❌ | ❌ | ✅ | ❌ | ❌ |
| View stall analytics | ❌ | ❌ | ✅ | ✅ | ❌ |
| Access hygiene inspection records | ❌ | ❌ | ✅ | ❌ | ✅ |
| Issue rental bills | ❌ | ❌ | ❌ | ✅ | ❌ |
| Pay rental bills | ❌ | ❌ | ✅ | ❌ | ❌ |
| View rental agreements | ❌ | ❌ | ❌ | ✅ | ❌ |
| View all stall complaints | ❌ | ❌ | ❌ | ❌ | ✅ |
| Schedule hygiene inspections | ❌ | ❌ | ❌ | ❌ | ✅ |

### Notes
- Guest orders are stored locally and are **not persisted** in the database.
- All payment features are **simulated** and do not involve real transactions.
- Role-based permissions are enforced using front-end logic and Firebase Authentication.
  
---
## Role-Based Access Control

Access to pages and features is controlled based on the user’s assigned role (Guest, Customer, Stall Holder, Operator, NEA Officer).

- Authentication and role information are managed using Firebase Authentication.
- User roles are stored in Cloud Firestore.
- Page access and data visibility are restricted through front-end logic and Firebase security rules.

---

## Team Members

| Name | Student ID | Contribution |
|-----|-----------|-------------|
| Shawn Ho | S10275058 |Index page, Home page, Stallholder pages (dashboard, orders, menu,review,analytics, hygiene, account, Manage payment) (all ui and functions),Google Login API  |
| Matthew Tay | S10273266 | Stall Menu Page, Food Item Options/Add-on’s Page, Operator Page, Forget Password  |
| Ryan Ng | S10275062 | Feedback, Reviews, Complaints page, NEA officer page, Signin, Signup |
| Ryan Tan | S10275517 | Cart, Orders, Orders Recieved, PayNow Page, Credit/ Debit Card Page  |
| Kaden Toh | S10273868 | Hygiene Page, Hygiene Score Trend , License Validity, Inspection History/log,|

Each team member handled distinct features to ensure clear individual contributions.

---

## Technologies Used

- HTML5  
- CSS3  
- JavaScript  
- GitHub & GitHub Pages

## Firebase Integration

This project uses **Firebase** as the backend platform to support authentication, data management, and media storage.

### Firebase Services Used

- **Firebase Authentication**
  - Email and password authentication
  - Google Sign-In for faster user registration and login

- **Cloud Firestore**
  - Stores application data such as users, stalls, menus, orders, reviews, complaints, and billing records
  - Supports role-based data access and management

- **Firebase Storage**
  - Stores images and media assets for stalls and food items
  - Enables secure image upload and retrieval

---

## Project File Structure (Role-Based Overview)

The project uses a role-based logical structure to organise pages and scripts according to different user roles, while keeping configuration, assets, styles, and shared logic separate.

```text
FED-Project/
│
├── .firebase/                          # Firebase hosting cache and build artifacts
├── .git/                               # Git version control directory
├── images/                             # Image assets (stall images, food photos, UI assets)
├── node_modules/                       # Node.js dependencies
├── public/                             # Firebase Hosting public directory
│
├── .firebaserc                         # Firebase project environment settings
├── firebase.json                       # Firebase hosting configuration
├── package.json                        # Project dependencies and scripts
├── package-lock.json                   # Dependency lock file
├── README.md                           # Project documentation
├── .gitignore                          # Files ignored by Git
│
├── css/                                # Stylesheets
│   ├── styles.css                      # Global styles shared across all pages
│   ├── footer.css                      # Footer layout and styling
│   ├── hygiene.css                     # Hygiene-related page styles
│   ├── operator.css                    # Operator dashboard styles
│   ├── nea.css                         # NEA officer page styles
│   └── stall-holder.css                # Stall holder specific styles
│
├── js/                                 # Shared JavaScript files
│   ├── firebase.js                     # Firebase initialization and configuration
│   ├── script.js                       # Shared/global utility logic
│   ├── google-login.js                 # Google Sign-In authentication logic
│   ├── cart-badge.js                   # Shopping cart badge counter logic
│   └── storeholder-context.js          # Shared context for stall holder pages
│
├── pages/                              # HTML pages grouped by user role
│
│   ├── common/                         # Public and shared informational pages
│   │   ├── index.html                  # Landing page (guest view)
│   │   ├── home.html                   # Home page after login
│   │   ├── about.html                  # About the system
│   │   ├── contact.html                # Contact information
│   │   ├── help.html                   # Help and FAQ
│   │   ├── how-it-works.html           # Explanation of system workflow
│   │   ├── pricing.html                # Pricing information
│   │   ├── privacy.html                # Privacy policy
│   │   ├── terms-of-service.html       # Terms and conditions
│   │   ├── credits.html                # Credits for external assets/resources
│   │   └── 404.html                    # Custom error page
│
│   ├── auth/                           # Authentication-related pages
│   │   ├── signin.html                 # User sign-in page
│   │   ├── signup.html                 # User sign-up page
│   │   └── forgot-password.html        # Password recovery page
│
│   ├── customer/                       # Customer-facing pages
│   │   ├── centres.html                # Hawker centre listing
│   │   ├── stall.html                  # Stall details page
│   │   ├── menu.html                   # Menu browsing
│   │   ├── item.html                   # Individual food item details
│   │   ├── cart.html                   # Shopping cart
│   │   ├── orders.html                 # Customer order history
│   │   ├── review.html                 # Submit reviews
│   │   ├── feedback.html               # Submit feedback
│   │   ├── feedback_history.html       # Feedback submission history
│   │   ├── complaint.html              # Submit complaints
│   │   ├── promotions.html             # Promotions and vouchers
│   │   ├── qr.html                     # QR code payment page
│   │   ├── payment_received.html       # Payment confirmation page
│   │   ├── hygiene.html                # View current hygiene grade
│   │   ├── hygiene-history.html        # View historical hygiene inspections
│   │   └── hygiene-trend.html          # View hygiene grade trends
│
│   ├── stall-holder/                   # Stall holder pages
│   │   ├── stall-dashboard.html        # Stall holder dashboard overview
│   │   ├── stall-orders.html           # Incoming orders management
│   │   ├── stall-menu.html             # Stall menu management
│   │   ├── stall-review.html           # View customer reviews
│   │   ├── stall-analytics.html        # Stall performance analytics
│   │   ├── stall-hygiene.html          # Stall hygiene records
│   │   ├── rental-payment.html         # Rental payment page
│   │   └── stall-account.html          # Stall holder account settings
│
│   ├── operator/                       # Operator pages
│   │   └── operator.html               # Operator dashboard and management tools
│
│   └── nea/                            # NEA officer pages
│       └── nea.html                    # NEA dashboard (inspections & records)
│
├── js-pages/                           # Page-specific JavaScript logic
│   ├── index.js                        # Landing page logic
│   ├── home.js                         # Home page logic
│   ├── centres.js                      # Hawker centre listing logic
│   ├── stall.js                        # Stall details logic
│   ├── menu.js                         # Menu browsing logic
│   ├── item.js                         # Food item logic
│   ├── cart.js                         # Cart functionality
│   ├── orders.js                       # Order history logic
│   ├── review.js                       # Review submission logic
│   ├── feedback.js                     # Feedback submission logic
│   ├── feedback_history.js             # Feedback history logic
│   ├── complaint.js                    # Complaint submission logic
│   ├── promotions.js                  # Promotions logic
│   ├── qr.js                           # QR payment logic
│   ├── payment_received.js             # Payment confirmation logic
│   ├── hygiene.js                      # Hygiene grade display logic
│   ├── hygiene-history.js              # Hygiene history logic
│   ├── hygiene-trend.js                # Hygiene trend visualization
│   ├── nea.js                          # NEA dashboard logic
│   ├── operator.js                     # Operator dashboard logic
│   ├── stall-dashboard.js              # Stall holder dashboard logic
│   ├── stall-orders.js                 # Stall order management logic
│   ├── stall-menu.js                   # Stall menu management logic
│   ├── stallmenu.js                    # Stall menu helper logic
│   ├── stall-review.js                 # Stall review logic
│   ├── stall-analytics.js              # Stall analytics logic
│   ├── stall-hygiene.js                # Stall hygiene logic
│   └── stall-account.js                # Stall holder account logic

```
---
## System Architecture Overview

This application follows a client-side architecture using HTML, CSS, and JavaScript for the front end, with Firebase providing backend services.

- Front-end pages handle user interaction and UI rendering.
- Firebase Authentication manages user sign-in and role-based access.
- Cloud Firestore stores application data such as users, stalls, orders, reviews, and complaints.
- Firebase Storage is used for storing stall and food images.

---
## Design & Development Approach

- Responsive design for desktop and mobile devices
- Consistent layout and navigation across all pages
- Clear visual hierarchy and readable UI
- Modular and organised file structure
- Meaningful commit messages and version control
- External assets properly credited

---

## Testing

The following checks were performed:
- HTML validation using W3C Markup Validator
- CSS validation using W3C CSS Validator
- Responsive testing on different screen sizes
- Manual testing of user flows and interactions (UAT TESTING) 

---

## Deployment

The project is deployed using GitHub Pages.

**GitHub Repository:**  
https://github.com/Shawnnho/FED-Project.git

**Live Site:**  
https://shawnnho.github.io/FED-Project/

To run locally:
1. Clone or download the repository
2. Open the project folder
3. Open `index.html` in a web browser

---

## Credits

All external images, icons, UI references, and learning resources used in this project are listed in **`credit.html`**.

All materials are used strictly for educational purposes.

---

## Notes

- This project is developed for Project purposes only
- Payment features are simulated and do not involve real transactions
- External assets are credited accordingly

---

## Module Information

Front-End Development (FED)  
Diploma in Information Technology  
School of Infocomm Technology  
Academic Year 2025–2026
