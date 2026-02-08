# Singapore Hawker Centre Management System

Front-End Development (FED) Assignment  
Academic Year 2025–2026

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

### 
Login Details for Testing

Customer : Test1@gmail.com
Password : Test1234

StallHolder : Kopifellas@gmail.com
Password : Test1234

Operator : bossmanjoebiden@gmail.com
Password : Test1234

Operator2 : bossmantrump@gmail.com
Password : Test1234

Nea Officer : officer@nea.gov.sg
Password : Test1234


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
