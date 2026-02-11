import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './context/Web3Context';
import Navbar from './components/Navbar';
import Marketplace from './pages/Marketplace';
import AdminMint from './pages/AdminMint';
import ProjectDetails from './pages/ProjectDetails';

function App() {
  return (
    <Web3Provider>
      <Router>
        <div className="app-wrapper">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Marketplace />} />
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
