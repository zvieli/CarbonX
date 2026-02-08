import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './context/Web3Context';
import Navbar from './components/Navbar';

// Placeholder Pages (We will create these next)
const Marketplace = () => <div className="container"><h2>Marketplace</h2><p>Loading active projects...</p></div>;
const AdminMint = () => <div className="container"><h2>Admin Mint</h2><p>Secure Admin Area</p></div>;
const ProjectDetails = () => <div className="container"><h2>Project Details</h2></div>;

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
