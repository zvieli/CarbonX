import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './context/Web3Context';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import AdminMint from './pages/AdminMint';
import ProjectDetails from './pages/ProjectDetails';
import Exchange from './pages/Exchange';

function App() {
  return (
    <Web3Provider>
      <Router>
        <div className="app-wrapper">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/exchange" element={<Exchange />} />
              <Route path="/admin" element={<AdminMint />} />
              <Route path="/project/:id" element={<ProjectDetails />} />
            </Routes>
          </main>
        </div>
      </Router>
    </Web3Provider>
  );
}

export default App;
