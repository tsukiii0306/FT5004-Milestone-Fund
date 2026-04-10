import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import WalletBanner from "./components/WalletBanner";
import Home from "./pages/Home";
import Create from "./pages/Create";
import Detail from "./pages/Detail";

function App() {
  return (
    <Router>
      <div className="mf-app">
        <Navbar />
        <WalletBanner />
        <main className="mf-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/campaign/:address" element={<Detail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
