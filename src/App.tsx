import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Register from "@/pages/Register";
import Payment from "@/pages/Payment";
import Grouping from "@/pages/Grouping";
import Roster from "@/pages/Roster";
import Withdrawal from "@/pages/Withdrawal";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/grouping" element={<Grouping />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/withdrawal" element={<Withdrawal />} />
        </Route>
      </Routes>
    </Router>
  );
}
