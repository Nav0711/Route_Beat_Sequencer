<h1 align="center" style="bold">
🚗 Route Beat Sequencer
</h1>   

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
│   ├── client/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── assets/
│   │   │   ├── components/
│   │   │   │   ├── services/
│   │   ├── .env
│   │   ├── .gitignore
│   │   ├── eslint.config.js
│   │   ├── index.html
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── vite.config.js
│   ├── server/
│   │   ├── index.js
│   │   ├── .env
│   │   ├── package-lock.json
│   │   ├── package.json
│   ├── package-lock.json
│   ├── package.json
```

## 🔧 Installation

1. **Clone the repository**
   ```
   git clone https://github.com/Nav0711/Route_Beat_Sequencer.git/
   cd Route_Beat_Sequencer
   ```
2. **Install Dependencies, from terminal as follow**
   1) ```bash
      cd Route_Beat_Sequencer
      npm i
      ```
   2) ```bash
      cd Route_Beat_Sequencer/client
      npm i
      ```
   3) ```bash
      cd Route_Beat_Sequencer/server
      npm i
      ```
3. **Create .env file in client folder**
   Add
   1) ```bash
      npm install dotenv
      ```
   2) ```bash
      cd Route_Beat_Sequencer/client
      ```
   3) ```
      touch .env
      ```
   4) In the .env file add this:
      ```bash
      VITE_ORS_API_KEY=your_openrouteservice_api_key
      ```
4. **Start the development server in client or server directory**
   ```bash
   cd Route_Beat_Sequencer/<client or server>
   npm run dev
   ```
5. **Or from the root if the full stack is integrated:**
    ```bash
   npm run start
   ```


    
## 📬 Contact
If you'd like to collaborate, hire, or provide feedback:

- 📧 **Email**: navvysingh07@gmail.com
- 🔗 **LinkedIn**: linkedin.com/in/navdeepsingh0711
- 💻 **GitHub**: github.com/Nav0711

---

<h2 align="center">
   Thank You and Enjoy
</h2>
