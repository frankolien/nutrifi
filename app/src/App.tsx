import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "@/components/layout";
import Dashboard from "@/routes/Dashboard";
import Stake from "@/routes/Stake";
import Borrow from "@/routes/Borrow";
import Markets from "@/routes/Markets";
import Liquidate from "@/routes/Liquidate";
import Activity from "@/routes/Activity";

/**
 * Router. The six routes match the nav order exactly. `Layout` is the
 * single wrapper so there's one place to add global concerns (auth,
 * error boundary, toast container) when the time comes.
 */
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/stake", element: <Stake /> },
      { path: "/borrow", element: <Borrow /> },
      { path: "/markets", element: <Markets /> },
      { path: "/liquidate", element: <Liquidate /> },
      { path: "/activity", element: <Activity /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
