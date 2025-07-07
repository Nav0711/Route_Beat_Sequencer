# 🚗 Route_Beat_Sequencer

**Route_Beat_Sequencer** is a full-stack web application built using the MERN stack that enables efficient and optimized route planning for field operations based on beat and outlet data from Excel files.

## 🌟 Features

- 📥 Upload Excel files containing beat and outlet location data.
- 📌 Choose a specific beat from a dropdown menu.
- 📍 Set starting location manually or use current GPS coordinates.
- 🗺️ Interactive map with Leaflet.js displaying routes.
- ⚡ Generates optimized routes using advanced clustering & 2-opt algorithm.
- 📊 Download optimized beat-wise route plans in Excel format.
- 🌐 Integrated with OpenRouteService for route and distance optimization.

## 🛠️ Tech Stack

- **Frontend:** React.js, Leaflet.js
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas
- **Routing API:** OpenRouteService
- **Libraries:** Axios, XLSX (SheetJS)

## 📁 Folder Structure
```
Route_Beat_Sequencer/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── services/
│   ├── .env
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── vite.config.js
├── server/
│   ├── index.js
│   ├── .env
│   ├── package-lock.json
│   ├── package.json
├── package-lock.json
├── package.json
```

## 🔧 Installation

1. **Clone the repository**
   git clone https://github.com/Nav0711/Route_Beat_Sequencer.git/
   cd Route_Beat_Sequencer
2. **Install Dependencies**
   npm install
3. **Create .env file in client folder**
   Add VITE_ORS_API_KEY=your_openrouteservice_api_key
4. **Start the development server**
   npm run dev
5. **Or from the root if the full stack is integrated:**
   npm run start
