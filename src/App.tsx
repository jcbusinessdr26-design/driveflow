import React, { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  Wrench,
  User,
  TrendingUp,
  Fuel,
  CarFront,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Filter,
  Calendar,
  LogOut,
  Camera,
  Check,
  ChevronDown,
  Trash2,
  Pencil,
  Bell,
  AlertTriangle,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  isWithinInterval,
  parseISO,
  differenceInDays,
  differenceInCalendarDays,
  isAfter
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from "recharts";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "./lib/supabase";

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseLocalNumber(val: any): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === 'number') return val;
  const parsed = Number(String(val).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  // Handles "YYYY-MM-DDTHH:mm:ss..."
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  
  // Handles DD/MM/YYYY
  if (datePart.includes('/')) {
    const [day, month, year] = datePart.split('/').map(Number);
    return new Date(year, month - 1, day);
  }

  // Handles YYYY-MM-DD
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// --- Types ---
type Platform = string;

interface PlatformDetail {
  name: string;
  amount: number;
}

interface Earning {
  id: string;
  date: string;
  platformDetails: PlatformDetail[];
  totalEarned: number;
  fuelCost: number;
  foodCost?: number;
  otherCost?: number;
  km?: number;
  trips?: number;
  hours?: number;
}

interface Maintenance {
  id: string;
  date: string;
  type: "Manutenção" | "Revisão";
  service: string;
  value: number;
  status: "Realizada" | "Pendente";
}

interface UserProfile {
  name: string;
  avatar: string;
  platforms: Platform[];
  monthlyGoal: number;
  vehicleType: "Alugado" | "Próprio";
  vehicleName?: string;
  licensePlate?: string;
  weeklyRent?: number;
  ipva?: number;
  fines?: number;
}

type FilterType = "dia" | "semana" | "mês" | "trimestre" | "semestre" | "anual" | "personalizado";

// --- Platform Brand Colors ---
function getPlatformStyle(name: string): { bg: string; text: string; border: string; dot: string; badge: string } {
  const n = name.toLowerCase();
  if (n === "uber") return {
    bg: "bg-zinc-900", text: "text-white", border: "border-zinc-900",
    dot: "bg-zinc-900", badge: "bg-zinc-900/10 text-zinc-900 border-zinc-900/20"
  };
  if (n === "99 pop" || n === "99pop" || n === "99") return {
    bg: "bg-yellow-400", text: "text-zinc-900", border: "border-yellow-400",
    dot: "bg-yellow-400", badge: "bg-yellow-400/20 text-yellow-700 border-yellow-400/40"
  };
  if (n === "indrive" || n === "in drive") return {
    bg: "bg-emerald-500", text: "text-white", border: "border-emerald-500",
    dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
  };
  return {
    bg: "bg-blue-600", text: "text-white", border: "border-blue-600",
    dot: "bg-blue-600", badge: "bg-blue-600/10 text-blue-600 border-blue-600/20"
  };
}

// --- Platform Icon ---
function PlatformLogo({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const n = name.toLowerCase();
  const sizeClass = size === "sm" ? "text-[10px]" : size === "md" ? "text-xs" : "text-sm";
  const boxSize = size === "sm" ? "w-8 h-8" : size === "md" ? "w-10 h-10" : "w-12 h-12";
  const style = getPlatformStyle(name);

  const label = n === "uber" ? "U" : n.includes("99") ? "99" : n === "indrive" || n === "in drive" ? "iD" : name.charAt(0).toUpperCase();

  return (
    <div className={`${boxSize} rounded-xl ${style.bg} flex items-center justify-center flex-shrink-0`}>
      <span className={`${sizeClass} font-black ${style.text}`}>{label}</span>
    </div>
  );
}

// --- Mock Data ---
const INITIAL_EARNINGS: Earning[] = [
  { id: "1", date: "2024-03-10", platformDetails: [{ name: "Uber", amount: 250 }], totalEarned: 250, fuelCost: 60, foodCost: 30, km: 120 },
  { id: "2", date: "2024-03-09", platformDetails: [{ name: "99 Pop", amount: 180 }], totalEarned: 180, fuelCost: 45, foodCost: 20, km: 90 },
  { id: "3", date: "2024-03-08", platformDetails: [{ name: "Uber", amount: 320 }], totalEarned: 320, fuelCost: 75, foodCost: 25, otherCost: 10, km: 150 },
];

const INITIAL_MAINTENANCE: Maintenance[] = [
  { id: "m1", date: "2024-02-15", type: "Manutenção", service: "Troca de Óleo", value: 150, status: "Realizada" },
  { id: "m2", date: "2024-01-20", type: "Revisão", service: "Revisão 40k", value: 800, status: "Pendente" },
];

// --- App Icon ---
function DriverFlowIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Front-view Car (Larger) */}
      <path
        d="M10 42 C10 40 12 38 14 38 H46 C48 38 50 40 50 42 V48 C50 50 48 52 46 52 H14 C12 52 10 50 10 48 V42 Z"
        stroke="white" strokeWidth="2.5" strokeLinejoin="round"
      />
      <path
        d="M16 38 L20 28 C21 26 23 25 25 25 H35 C37 25 39 26 40 28 L44 38"
        stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
      />
      {/* Headlights */}
      <circle cx="16" cy="45" r="2.5" fill="white" fillOpacity="0.8" />
      <circle cx="44" cy="45" r="2.5" fill="white" fillOpacity="0.8" />
      {/* Growth/Performance Bars (Integrated) */}
      <rect x="52" y="38" width="4" height="14" rx="1.5" fill="white" fillOpacity="0.6" />
      <rect x="58" y="32" width="4" height="20" rx="1.5" fill="white" fillOpacity="0.8" />
      {/* Arrow up */}
      <path
        d="M58 28 L62 24 L58 20"
        stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
      />
      <path
        d="M62 24 L52 24"
        stroke="white" strokeWidth="2.5" strokeLinecap="round"
      />
    </svg>
  );
}

// --- Components ---

const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("bg-white border border-zinc-200 rounded-3xl p-5 shadow-sm", className)} {...props}>
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
  ...props
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20",
    secondary: "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    ghost: "bg-transparent hover:bg-zinc-100 text-zinc-500",
    white: "bg-white hover:bg-zinc-50 text-blue-600 shadow-lg shadow-blue-900/10"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-3 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  prefix,
  theme = "light"
}: {
  label?: string;
  type?: string;
  value: string | number;
  onChange: (val: string) => void; 
  placeholder?: string;
  prefix?: string;
  theme?: "light" | "dark";
}) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={cn("text-[11px] font-black uppercase tracking-[0.15em] mb-0.5", theme === "dark" ? "text-blue-100" : "text-zinc-500")}>{label}</label>}
    <div className="relative flex items-center">
      {prefix && <span className={cn("absolute left-4 font-medium", theme === "dark" ? "text-blue-200" : "text-zinc-400")}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full border rounded-2xl px-4 py-3.5 focus:outline-none transition-all",
          theme === "dark"
            ? "bg-white/10 border-white/20 text-white focus:border-white focus:ring-4 focus:ring-white/10 placeholder:text-blue-200"
            : "bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-blue-500 placeholder:text-zinc-400",
          prefix && "pl-12"
        )}
      />
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  // State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [screen, setScreen] = useState<"auth" | "setup" | "main">("auth");
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"home" | "add" | "maintenance" | "profile">("home");

  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [editingEarning, setEditingEarning] = useState<Earning | null>(null);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);

  const [maintenanceAlertsEnabled, setMaintenanceAlertsEnabled] = useState<boolean>(true);

  const [notificationAcknowledged, setNotificationAcknowledged] = useState<boolean>(false);

  const [filter, setFilter] = useState<FilterType>("mês");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      setLoading(true);
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (session) {
        await fetchAllData(session.user.id);
        setScreen("main");
      } else {
        setScreen("auth");
      }
    } catch (err) {
      console.error("Error checking user session:", err);
      setScreen("auth");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async (userId: string) => {
    // Fetch Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profile) {
      setUser({
        name: profile.name,
        avatar: profile.avatar,
        platforms: profile.platforms,
        monthlyGoal: Number(profile.monthly_goal),
        vehicleType: profile.vehicle_type as any,
        vehicleName: profile.vehicle_name,
        licensePlate: profile.license_plate,
        weeklyRent: profile.weekly_rent ? Number(profile.weekly_rent) : undefined,
        ipva: profile.ipva ? Number(profile.ipva) : 0,
        fines: profile.fines ? Number(profile.fines) : 0,
      });
    }

    // Fetch Earnings
    const { data: earningsData } = await supabase
      .from('earnings')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (earningsData) {
      setEarnings(earningsData.map(e => ({
        id: e.id,
        date: e.date,
        platformDetails: e.platform_details,
        totalEarned: Number(e.total_earned),
        fuelCost: Number(e.fuel_cost),
        foodCost: Number(e.food_cost),
        otherCost: Number(e.other_cost),
        km: Number(e.km),
        trips: Number(e.trips || 0),
        hours: Number(e.hours_worked || 0)
      })));
    }

    // Fetch Maintenance
    const { data: maintenanceData } = await supabase
      .from('maintenance')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (maintenanceData) {
      setMaintenance(maintenanceData.map(m => ({
        id: m.id,
        date: m.date,
        type: m.type,
        service: m.service,
        value: Number(m.value),
        status: m.status
      })));
    }
  };

  const handleAuthSuccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        setScreen("setup");
      } else {
        await fetchAllData(session.user.id);
        setScreen("main");
      }
    }
  };

  const handleSetupComplete = async (profile: UserProfile) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from('profiles').insert({
      id: session.user.id,
      name: profile.name,
      avatar: profile.avatar,
      platforms: profile.platforms,
      monthly_goal: profile.monthlyGoal,
      vehicle_type: profile.vehicleType,
      vehicle_name: profile.vehicleName,
      license_plate: profile.licensePlate,
      weekly_rent: profile.weeklyRent,
      ipva: profile.ipva,
      fines: profile.fines
    });

    if (!error) {
      setUser(profile);
      setScreen("main");
    }
  };

  const filterRange = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;

    switch (filter) {
      case "dia":
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case "semana":
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case "mês":
        start = startOfMonth(new Date(selectedYear, selectedMonth, 1));
        end = endOfMonth(new Date(selectedYear, selectedMonth, 1));
        break;
      case "trimestre":
        start = startOfQuarter(now);
        end = endOfQuarter(now);
        break;
      case "semestre":
        start = startOfMonth(new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1));
        end = endOfMonth(new Date(now.getFullYear(), now.getMonth() < 6 ? 5 : 11, 1));
        break;
      case "anual":
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      case "personalizado":
        if (!customRange.start || !customRange.end) return { start: startOfDay(now), end: endOfDay(now) };
        start = startOfDay(parseLocalDate(customRange.start));
        end = endOfDay(parseLocalDate(customRange.end));
        break;
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
    return { start, end };
  }, [filter, customRange, selectedMonth, selectedYear]);

  // Filter Logic
  const filteredEarnings = useMemo(() => {
    return earnings.filter(e => {
      const date = parseLocalDate(e.date);
      return isWithinInterval(date, { start: filterRange.start, end: filterRange.end });
    });
  }, [earnings, filterRange]);

  const filteredMaintenance = useMemo(() => {
    return maintenance.filter(m => {
      const date = parseLocalDate(m.date);
      return isWithinInterval(date, { start: filterRange.start, end: filterRange.end });
    });
  }, [maintenance, filterRange]);

  const stats = useMemo(() => {
    const totalEarned = filteredEarnings.reduce((acc, curr) => acc + (curr.totalEarned || 0), 0);
    const totalFuel = filteredEarnings.reduce((acc, curr) => acc + (curr.fuelCost || 0), 0);
    const totalFood = filteredEarnings.reduce((acc, curr) => acc + (curr.foodCost || 0), 0);
    const totalOther = filteredEarnings.reduce((acc, curr) => acc + (curr.otherCost || 0), 0);
    const totalKm = filteredEarnings.reduce((acc, curr) => acc + (curr.km || 0), 0);
    const totalTrips = filteredEarnings.reduce((acc, curr) => acc + (curr.trips || 0), 0);
    const totalHours = filteredEarnings.reduce((acc, curr) => acc + (curr.hours || 0), 0);

    // Maintenance in the period (only realized)
    const totalMaintenance = filteredMaintenance
      .filter(m => m.status === "Realizada")
      .reduce((acc, curr) => acc + (curr.value || 0), 0);

    // Unique days worked (dates with at least one record)
    const uniqueDates = new Set(filteredEarnings.map(e => e.date));
    const workedDays = uniqueDates.size;

    let autoExpenses = 0;
    
    // Proportional Rent based on worked days (not calendar days)
    if (user?.vehicleType === "Alugado" && user.weeklyRent) {
      const weekly = parseLocalNumber(user.weeklyRent);
      const dailyRent = weekly / 7;
      autoExpenses = dailyRent * workedDays;
    }

    // Proportional IPVA/Fines based on worked days
    if (user?.vehicleType === "Próprio") {
      const ipva = parseLocalNumber(user.ipva);
      const fines = parseLocalNumber(user.fines);
      const yearDays = 365;
      const dailyIpva = ipva / yearDays;
      autoExpenses = (dailyIpva * workedDays) + fines; // Assuming fines apply if any work is done in period, or maybe better to just add them. We'll keep them as total for the period.
    }

    const rawNetProfit = totalEarned - totalFuel - totalFood - totalOther - totalMaintenance - autoExpenses;
    const netProfit = isNaN(rawNetProfit) ? 0 : rawNetProfit;
    
    const gainPerKm = totalKm > 0 ? netProfit / totalKm : 0;
    const gainPerHour = totalHours > 0 ? netProfit / totalHours : 0;
    const avgNetPerTrip = totalTrips > 0 ? netProfit / totalTrips : 0;

    return { 
      totalEarned, totalFuel, totalFood, totalOther, totalKm, totalTrips, totalHours, totalMaintenance, workedDays,
      netProfit, autoExpenses, autoExpensesDays: workedDays, gainPerKm, gainPerHour, avgNetPerTrip 
    };
  }, [filteredEarnings, filteredMaintenance, user]);

  const hasTodayMaintenance = useMemo(() => {
    if (!maintenanceAlertsEnabled) return false;
    const today = format(new Date(), 'yyyy-MM-dd');
    return maintenance.some(m => m.date === today && m.status === "Pendente");
  }, [maintenance, maintenanceAlertsEnabled]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sora selection:bg-blue-500/30">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center bg-blue-600"
          >
            <div className="flex flex-col items-center gap-4">
              <DriverFlowIcon className="w-16 h-16 animate-bounce" />
              <p className="text-white font-bold animate-pulse text-sm uppercase tracking-widest">Carregando...</p>
            </div>
          </motion.div>
        ) : (
          <>
            {screen === "auth" && <AuthScreen onLoginSuccess={handleAuthSuccess} />}
            {screen === "setup" && <SetupScreen onComplete={handleSetupComplete} />}
            {screen === "main" && (
              <motion.div
                key="main"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pb-28"
              >
                {/* Header */}
                <header className="px-5 py-4 flex justify-between items-center sticky top-0 z-40 bg-gradient-to-r from-blue-700 to-blue-500 shadow-lg shadow-blue-500/30">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-0">
                      <div className="w-[83px] h-[83px] rounded-xl overflow-hidden flex items-center justify-center">
                        <img src="/icon.png" alt="DriverFlow" className="w-full h-full object-cover" />
                      </div>
                      <div className="ml-[-12px]">
                        <h1 className="text-xl font-black tracking-tight text-white line-clamp-1">DriverFlow <span className="text-[8px] font-normal opacity-40">v3.7</span></h1>
                        <p className="text-[11px] text-blue-100 font-medium">Olá, {user?.name} 👋</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button className="w-11 h-11 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-white relative active:scale-95 transition-transform">
                        <Bell className="w-5 h-5" />
                        {hasTodayMaintenance && (
                          <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 border-2 border-blue-600 rounded-full animate-pulse" />
                        )}
                      </button>
                    </div>

                    <div className="w-11 h-11 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center overflow-hidden">
                      {user?.avatar ? (
                        <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </div>
                </header>

                {/* Content */}
                <main className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
                  {activeTab === "home" && (
                    <HomeScreen
                      user={user}
                      stats={stats}
                      filter={filter}
                      filterRange={filterRange}
                      setFilter={setFilter}
                      earnings={filteredEarnings}
                      goal={user?.monthlyGoal || 0}
                      customRange={customRange}
                      setCustomRange={setCustomRange}
                      selectedMonth={selectedMonth}
                      setSelectedMonth={setSelectedMonth}
                      selectedYear={selectedYear}
                      setSelectedYear={setSelectedYear}
                      hasTodayMaintenance={hasTodayMaintenance}
                      notificationAcknowledged={notificationAcknowledged}
                      onAcknowledge={() => setNotificationAcknowledged(true)}
                      onEditEarning={(e) => {
                        setEditingEarning(e);
                        setActiveTab("add");
                      }}
                      onDeleteEarning={async (id) => {
                        const { error } = await supabase
                          .from('earnings')
                          .delete()
                          .eq('id', id);
                        if (!error) {
                          setEarnings(earnings.filter(e => e.id !== id));
                        }
                      }}
                    />
                  )}
                  {activeTab === "add" && (
                    <AddEarningScreen
                      platforms={user?.platforms || []}
                      editingEarning={editingEarning}
                      onAdd={async (e) => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) return;

                        if (editingEarning) {
                          const { error } = await supabase
                            .from('earnings')
                            .update({
                              date: e.date,
                              platform_details: e.platformDetails,
                              total_earned: e.totalEarned,
                              fuel_cost: e.fuelCost,
                              food_cost: e.foodCost || 0,
                              other_cost: e.otherCost || 0,
                              km: e.km || 0,
                              trips: e.trips || 0,
                              hours_worked: e.hours || 0
                            })
                            .eq('id', editingEarning.id);

                          if (!error) {
                            setEarnings(earnings.map(item => item.id === editingEarning.id ? { ...e, id: editingEarning.id } : item));
                            setEditingEarning(null);
                            setActiveTab("home");
                          }
                        } else {
                          const { data: newEarning, error } = await supabase
                            .from('earnings')
                            .insert({
                              user_id: session.user.id,
                              date: e.date,
                              platform_details: e.platformDetails,
                              total_earned: e.totalEarned,
                              fuel_cost: e.fuelCost,
                              food_cost: e.foodCost || 0,
                              other_cost: e.otherCost || 0,
                              km: e.km || 0,
                              trips: e.trips || 0,
                              hours_worked: e.hours || 0
                            })
                            .select()
                            .single();

                          if (!error && newEarning) {
                            setEarnings([{
                              id: newEarning.id,
                              date: newEarning.date,
                              platformDetails: newEarning.platform_details,
                              totalEarned: Number(newEarning.total_earned),
                              fuelCost: Number(newEarning.fuel_cost),
                              foodCost: Number(newEarning.food_cost),
                                otherCost: newEarning.other_cost,
                                km: newEarning.km,
                                trips: newEarning.trips,
                                hours: newEarning.hours_worked
                              }, ...earnings]);
                            setActiveTab("home");
                          }
                        }
                      }}
                      onCancel={() => {
                        setEditingEarning(null);
                        setActiveTab("home");
                      }}
                    />
                  )}
                  {activeTab === "maintenance" && (
                    <MaintenanceScreen
                      user={user}
                      maintenance={maintenance}
                      onAdd={async (m) => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) return;

                        const { data: newMaint, error } = await supabase
                          .from('maintenance')
                          .insert({
                            user_id: session.user.id,
                            date: m.date,
                            type: m.type,
                            service: m.service,
                            value: m.value,
                            status: m.status
                          })
                          .select()
                          .single();

                        if (!error && newMaint) {
                          setMaintenance([{
                            id: newMaint.id,
                            date: newMaint.date,
                            type: newMaint.type,
                            service: newMaint.service,
                            value: Number(newMaint.value),
                            status: newMaint.status
                          }, ...maintenance]);
                        }
                      }}
                      onUpdate={async (m) => {
                        const { error } = await supabase
                          .from('maintenance')
                          .update({
                            date: m.date,
                            type: m.type,
                            service: m.service,
                            value: m.value,
                            status: m.status
                          })
                          .eq('id', m.id);

                        if (!error) {
                          setMaintenance(maintenance.map(item => item.id === m.id ? m : item));
                        }
                      }}
                      onDelete={async (id) => {
                        const { error } = await supabase
                          .from('maintenance')
                          .delete()
                          .eq('id', id);

                        if (!error) {
                          setMaintenance(maintenance.filter(m => m.id !== id));
                        }
                      }}
                    />
                  )}
                  {activeTab === "profile" && (
                    <ProfileScreen
                      user={user}
                      onLogout={async () => {
                        await supabase.auth.signOut();
                        setUser(null);
                        setEarnings([]);
                        setMaintenance([]);
                        setScreen("auth");
                        setActiveTab("home");
                      }}
                      onUpdate={async (updated) => {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) return;

                        const { error } = await supabase
                          .from('profiles')
                          .update({
                            name: updated.name,
                            avatar: updated.avatar,
                            platforms: updated.platforms,
                            monthly_goal: updated.monthlyGoal,
                            vehicle_type: updated.vehicleType,
                            vehicle_name: updated.vehicleName,
                            license_plate: updated.licensePlate,
                            weekly_rent: updated.weeklyRent,
                            ipva: updated.ipva,
                            fines: updated.fines
                          })
                          .eq('id', session.user.id);

                        if (error) {
                          alert("Erro ao salvar perfil: " + error.message);
                          throw error; // Let the screen know it failed
                        } else {
                          setUser(updated);
                        }
                      }}
                      maintenanceAlertsEnabled={maintenanceAlertsEnabled}
                      setMaintenanceAlertsEnabled={setMaintenanceAlertsEnabled}
                    />
                  )}
                </main>

                <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-zinc-100 px-4 pb-safe pt-2 flex justify-around items-center z-50" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                  <NavButton active={activeTab === "home"} onClick={() => setActiveTab("home")} icon={<LayoutDashboard />} label="Início" />
                  <NavButton active={activeTab === "add"} onClick={() => setActiveTab("add")} icon={<PlusCircle />} label="Ganhos" />
                  <NavButton active={activeTab === "maintenance"} onClick={() => setActiveTab("maintenance")} icon={<Wrench />} label="Oficina" />
                  <NavButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")} icon={<User />} label="Perfil" />
                </nav>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Screens ---

function AuthScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  const handleAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      }
      onLoginSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center min-h-screen p-8 bg-gradient-to-r from-blue-700 to-blue-500"
    >
      <div className="w-[155px] h-[155px] rounded-3xl overflow-hidden shadow-2xl shadow-blue-900/40" style={{ marginBottom: '-15px' }}>
        <img src="/icon.png" alt="DriverFlow" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-4xl font-bold mb-2 tracking-tighter text-center text-white">DriverFlow</h1>
      <p className="text-blue-100 mb-8 max-w-[280px] text-center font-medium">Gestão inteligente para motoristas de aplicativo.</p>

      <div className="w-full space-y-4 max-w-sm">
        {error && (
          <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-white text-xs font-medium backdrop-blur-sm">
            {error}
          </div>
        )}
        <Input label="E-mail" type="email" value={email} onChange={setEmail} placeholder="seu@email.com" theme="dark" />
        <Input label="Senha" type="password" value={password} onChange={setPassword} placeholder="••••••••" theme="dark" />

        <div className="flex items-center gap-2 px-1 pb-1">
          <button
            onClick={() => setRememberMe(!rememberMe)}
            className={cn(
              "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
              rememberMe ? "bg-white border-white" : "bg-white/10 border-white/20"
            )}
          >
            {rememberMe && <Check className="w-3.5 h-3.5 text-blue-600" strokeWidth={4} />}
          </button>
          <span 
            className="text-[10px] font-black text-blue-100 uppercase tracking-widest cursor-pointer select-none" 
            onClick={() => setRememberMe(!rememberMe)}
          >
            Manter conectado
          </span>
        </div>

        <Button
          onClick={handleAuth}
          className="w-full text-blue-700"
          variant="white"
          disabled={loading || !email || !password}
        >
          {loading ? "Carregando..." : (isSignUp ? "Criar Conta" : "Entrar")}
        </Button>
      </div>

      <p className="mt-8 text-xs text-blue-100 text-center">
        {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"} {" "}
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-white font-bold hover:underline transition-all"
        >
          {isSignUp ? "Entrar" : "Cadastre-se"}
        </button>
      </p>
    </motion.div>
  );
}

function SetupScreen({ onComplete }: { onComplete: (p: UserProfile) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [goal, setGoal] = useState("3000");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["Uber"]);
  const [customPlatform, setCustomPlatform] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [vehicleType, setVehicleType] = useState<"Alugado" | "Próprio">("Alugado");
  const [weeklyRent, setWeeklyRent] = useState("500");
  const [ipva, setIpva] = useState("0");
  const [fines, setFines] = useState("0");

  const defaultPlatforms: Platform[] = ["Uber", "99 Pop", "InDrive"];

  const togglePlatform = (p: Platform) => {
    if (selectedPlatforms.includes(p)) {
      setSelectedPlatforms(selectedPlatforms.filter(x => x !== p));
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const addCustomPlatform = () => {
    if (customPlatform && !selectedPlatforms.includes(customPlatform)) {
      setSelectedPlatforms([...selectedPlatforms, customPlatform]);
      setCustomPlatform("");
      setShowCustomInput(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-8 pt-20"
    >
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", s <= step ? "bg-blue-600" : "bg-zinc-200")} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Vamos começar?</h2>
          <p className="text-zinc-500">Personalize seu perfil para começar.</p>

          <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-3xl bg-zinc-50 border-2 border-zinc-100 overflow-hidden flex items-center justify-center">
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-10 h-10 text-zinc-300" />
                )}
              </div>
              <label className="absolute -bottom-2 -right-2 bg-blue-600 p-2 rounded-xl border-4 border-white cursor-pointer hover:bg-blue-700 transition-colors shadow-lg">
                <Camera className="w-4 h-4 text-white" />
                <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
              </label>
            </div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sua Foto</p>
          </div>

          <Input label="Nome" value={name} onChange={setName} placeholder="Ex: João Silva" />
          <Input label="Veículo" value={vehicleName} onChange={setVehicleName} placeholder="Ex: Toyota Corolla" />
          <Input label="Placa" value={licensePlate} onChange={setLicensePlate} placeholder="ABC-1234" />

          <div className="pt-4">
            <Button onClick={() => setStep(2)} disabled={!name || !vehicleName || !licensePlate} className="w-full">Continuar</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Plataformas</h2>
          <p className="text-zinc-400">Em quais aplicativos você trabalha?</p>
          <div className="grid grid-cols-1 gap-3">
            {[...defaultPlatforms, ...selectedPlatforms.filter(p => !defaultPlatforms.includes(p))].map(p => {
              const sel = selectedPlatforms.includes(p);
              const ps = getPlatformStyle(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "p-4 rounded-2xl border text-sm font-semibold transition-all flex justify-between items-center gap-3",
                    sel ? `${ps.bg} ${ps.border} ${ps.text}` : "bg-white border-zinc-200 text-zinc-500"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <PlatformLogo name={p} size="sm" />
                    <span className={sel ? ps.text : "text-zinc-700"}>{p}</span>
                  </div>
                  {sel && <Check className="w-4 h-4" />}
                </button>
              );
            })}
            <button
              onClick={() => setShowCustomInput(true)}
              className="p-4 rounded-2xl border border-dashed border-zinc-300 text-sm font-semibold text-zinc-400 flex items-center justify-center gap-2 hover:border-zinc-400 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Adicionar outra plataforma
            </button>
          </div>

          {showCustomInput && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
              <Input value={customPlatform} onChange={setCustomPlatform} placeholder="Nome da plataforma" />
              <Button onClick={addCustomPlatform} className="px-6">Add</Button>
            </motion.div>
          )}

          <div className="pt-4 flex gap-3">
            <Button onClick={() => setStep(1)} variant="secondary" className="flex-1">Voltar</Button>
            <Button onClick={() => setStep(3)} disabled={selectedPlatforms.length === 0} className="flex-1">Continuar</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Sua Meta</h2>
          <p className="text-zinc-400">Quanto você deseja ganhar por mês?</p>
          <Input label="Meta Mensal Líquida" type="number" prefix="R$" value={goal} onChange={setGoal} />
          <div className="pt-4 flex gap-3">
            <Button onClick={() => setStep(2)} variant="secondary" className="flex-1">Voltar</Button>
            <Button onClick={() => setStep(4)} className="flex-1">Continuar</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Seu Veículo</h2>
          <p className="text-zinc-400">Como você trabalha hoje?</p>

          <div className="flex gap-2 bg-zinc-100 p-1 rounded-2xl">
            <button
              onClick={() => setVehicleType("Alugado")}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                vehicleType === "Alugado" ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500"
              )}
            >
              Alugado
            </button>
            <button
              onClick={() => setVehicleType("Próprio")}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                vehicleType === "Próprio" ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500"
              )}
            >
              Próprio
            </button>
          </div>

          {vehicleType === "Alugado" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <Input label="Valor do Aluguel Semanal" type="number" prefix="R$" value={weeklyRent} onChange={setWeeklyRent} />
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                * O valor do aluguel será provisionado automaticamente nos seus cálculos financeiros.
              </p>
            </motion.div>
          )}
          
          {vehicleType === "Próprio" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <Input label="Nome do Veículo" value={vehicleName} onChange={setVehicleName} placeholder="Ex: Toyota Corolla" />
              <Input label="Placa" value={licensePlate} onChange={setLicensePlate} placeholder="ABC-1234" />
              <Input label="IPVA Anual" type="number" prefix="R$" value={ipva} onChange={setIpva} />
              <Input label="Multas" type="number" prefix="R$" value={fines} onChange={setFines} />
            </motion.div>
          )}

          <div className="pt-4 flex gap-3">
            <Button onClick={() => setStep(3)} variant="secondary" className="flex-1">Voltar</Button>
            <Button
              onClick={() => onComplete({
                name,
                avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
                platforms: selectedPlatforms,
                monthlyGoal: parseLocalNumber(goal),
                vehicleType,
                vehicleName,
                licensePlate,
                weeklyRent: vehicleType === "Alugado" ? parseLocalNumber(weeklyRent) : undefined,
                ipva: vehicleType === "Próprio" ? parseLocalNumber(ipva) : undefined,
                fines: vehicleType === "Próprio" ? parseLocalNumber(fines) : undefined
              })}
              className="flex-1"
            >
              Finalizar
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function HomeScreen({
  user,
  stats,
  filter,
  setFilter,
  earnings,
  goal,
  customRange,
  filterRange,
  setCustomRange,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  hasTodayMaintenance,
  notificationAcknowledged,
  onAcknowledge,
  onEditEarning,
  onDeleteEarning
}: {
  user: UserProfile | null;
  stats: any;
  filter: FilterType;
  setFilter: (f: FilterType) => void;
  earnings: Earning[];
  goal: number;
  customRange: { start: string; end: string };
  filterRange: { start: Date; end: Date };
  setCustomRange: (range: { start: string; end: string }) => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  hasTodayMaintenance: boolean;
  notificationAcknowledged: boolean;
  onAcknowledge: () => void;
  onEditEarning: (e: Earning) => void;
  onDeleteEarning: (id: string) => void;
}) {
  const progress = goal > 0
    ? Math.min((stats.netProfit / goal) * 100, 100)
    : 0;
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const years = Array.from({ length: 16 }, (_, i) => 2025 + i);

  const handleExport = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text("Relatório DriverFlow", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Motorista: ${user?.name}`, 14, 28);
    doc.text(`Período: ${format(filterRange.start, 'dd/MM/yyyy')} até ${format(filterRange.end, 'dd/MM/yyyy')}`, 14, 34);
    
    // Earnings Table
    const tableHeaders = [["Data", "Bruto", "Combustível", "Alimentação", "Outros", "KM", "Corridas", "Horas"]];
    const tableData = earnings.map(e => [
      format(parseLocalDate(e.date), 'dd/MM/yyyy'),
      `R$ ${e.totalEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${e.fuelCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${(e.foodCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${(e.otherCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      e.km || 0,
      e.trips || 0,
      e.hours || 0
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: tableHeaders,
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.cursor.y + 10;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Resumo Financeiro", 14, finalY);
    
    doc.setFontSize(10);
    doc.text(`Total Bruto: R$ ${stats.totalEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, finalY + 8);
    doc.text(`Custos Operacionais: R$ ${(stats.totalFuel + stats.totalFood + stats.totalOther).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, finalY + 14);
    doc.text(`Custos Fixos (Aluguel/IPVA): R$ ${stats.autoExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, finalY + 20);
    
    doc.setFontSize(12);
    const isPositive = stats.netProfit >= 0;
    if (isPositive) doc.setTextColor(16, 185, 129); // emerald-600
    else doc.setTextColor(244, 63, 94); // rose-600
    doc.text(`LUCRO LÍQUIDO: R$ ${stats.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, finalY + 30);

    doc.save(`driverflow_relatorio_${filter}.pdf`);
  };

  return (
    <div className="space-y-6 pb-12">
      <AnimatePresence>
        {hasTodayMaintenance && !notificationAcknowledged && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md"
            >
              <Card className="bg-blue-600 border-none shadow-[0_20px_50px_rgba(37,99,235,0.3)] text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <AlertTriangle className="w-24 h-24 rotate-12" />
                </div>
                <div className="relative z-10 flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Wrench className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-lg text-white">Lembrete de Manutenção</h3>
                    <p className="text-[10px] text-blue-600 bg-white inline-block px-2 py-0.5 rounded-lg mt-1 font-black uppercase tracking-wider">Hoje acontece!</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge();
                    }}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors active:scale-90"
                  >
                    <Check className="w-5 h-5 text-white" />
                  </button>
                </div>
                <p className="mt-4 text-sm text-blue-50 font-medium leading-relaxed">
                  Você possui uma manutenção ou revisão agendada para hoje. Não esqueça de conferir os detalhes na aba Oficina!
                </p>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={onAcknowledge}
                    className="text-xs font-black text-white/60 hover:text-white uppercase tracking-widest transition-colors"
                  >
                    Entendi, obrigado
                  </button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold tracking-tight text-zinc-900">Período de Análise</h2>
        <button 
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-6 px-6">
        {["dia", "semana", "mês", "trimestre", "semestre", "anual", "personalizado"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as FilterType)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
              filter === f
                ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20"
                : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-300"
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filter === "mês" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-100"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Mês</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-blue-500"
            >
              {months.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Ano</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-blue-500"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {filter === "personalizado" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-4"
        >
          <Input type="date" value={customRange.start} onChange={(val) => setCustomRange({ ...customRange, start: val })} label="Início" />
          <Input type="date" value={customRange.end} onChange={(val) => setCustomRange({ ...customRange, end: val })} label="Fim" />
        </motion.div>
      )}

      {/* Main Stats */}
      {(() => {
        const displayProfit = stats.netProfit;
        const isPositive = displayProfit >= 0;
        return (
          <Card className={cn(
            "relative overflow-hidden text-white shadow-xl",
            isPositive
              ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400 shadow-emerald-500/20"
              : "bg-gradient-to-br from-rose-500 to-rose-600 border-rose-400 shadow-rose-500/20"
          )}>
            <div className={cn("absolute -right-10 -top-10 w-40 h-40 blur-3xl rounded-full", isPositive ? "bg-white/10" : "bg-white/10")} />
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className={cn("text-xs font-bold uppercase tracking-widest mb-1", isPositive ? "text-emerald-100" : "text-rose-100")}>
                    Lucro Líquido
                  </p>
                  <h2 className="text-4xl font-bold tracking-tighter relative -left-1">
                    R$ {displayProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h2>
                  <p className="text-[10px] mt-2 opacity-90 leading-tight pr-8">
                    Já com combustível, alimentação, outros gastos e aluguel descontados.
                  </p>
                </div>
                <div className="bg-white/20 p-2 rounded-xl flex-shrink-0">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Bloco 2: Meta */}
      {goal > 0 && typeof stats.netProfit !== 'undefined' && (() => {
        const achievedProfit = stats.netProfit;
        const metaProgress = Math.min(100, Math.max(0, (achievedProfit / goal) * 100));
        const remainingGoal = Math.max(0, goal - achievedProfit);
        
        return (
          <Card className="p-4 space-y-3">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Meta do Mês: R$ {goal.toLocaleString('pt-BR')}
                </p>
                {remainingGoal > 0 ? (
                  <p className="text-xl font-black text-zinc-900 tracking-tight">
                    Atingido <span className="text-emerald-600">R$ {achievedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                ) : (
                  <p className="text-xl font-black text-emerald-600 tracking-tight">
                    Meta atingida 🎉
                  </p>
                )}
              </div>
              <TrendingUp className={cn("w-5 h-5 mb-1", remainingGoal > 0 ? "text-blue-500" : "text-emerald-500")} />
            </div>
            
            <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${metaProgress}%` }}
                className={cn("h-full rounded-full transition-all duration-1000", remainingGoal > 0 ? "bg-blue-500" : "bg-emerald-500")}
              />
            </div>
          </Card>
        );
      })()}

      {/* Bloco 3: Corridas Restantes */}
      {goal > 0 && stats.netProfit !== undefined && stats.netProfit < goal && stats.avgNetPerTrip > 0 && (() => {
        const remainingGoal = goal - stats.netProfit;
        const tripsNeeded = Math.ceil(remainingGoal / stats.avgNetPerTrip);
        return (
          <Card className="p-4 bg-purple-50 border-purple-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-xl">
                <CarFront className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Para bater a meta:</p>
                <p className="text-lg font-black text-purple-700 tracking-tight">faltam ~{tripsNeeded} corridas</p>
                <p className="text-[9px] font-medium text-purple-600/70 mt-0.5">Baseado na sua média líquida por corrida</p>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Bloco 4: Operacional */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Card className="flex flex-col gap-1 p-3">
            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Bruto</p>
            <p className="text-sm font-black text-zinc-900 line-clamp-1">R$ {stats.totalEarned.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          </Card>
          <Card className="flex flex-col gap-1 p-3">
            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Gastos</p>
            <p className="text-sm font-black text-rose-600 line-clamp-1">- R$ {(stats.totalFuel + stats.totalFood + stats.totalOther + stats.totalMaintenance).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          </Card>
          <Card className="flex flex-col gap-1 p-3">
            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">KM</p>
            <p className="text-sm font-black text-blue-600 line-clamp-1">{stats.totalKm.toLocaleString('pt-BR')}</p>
          </Card>
        </div>
        
        {stats.autoExpenses > 0 && (
          <Card className="flex items-center justify-between p-3 border-rose-100 bg-rose-50/50">
            <div className="flex items-center gap-2 text-rose-600">
              <Wrench className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {user?.vehicleType === "Alugado"
                  ? `Aluguel (${stats.workedDays} ${stats.workedDays === 1 ? 'dia' : 'dias'})`
                  : `Custos Fixos (${stats.workedDays} ${stats.workedDays === 1 ? 'dia' : 'dias'})`}
              </span>
            </div>
            <p className="text-sm font-black text-rose-600">- R$ {stats.autoExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </Card>
        )}
      </div>

      <details className="group">
        <summary className="text-xs font-bold text-zinc-500 uppercase tracking-wider cursor-pointer flex items-center gap-2 mb-3 list-none p-2 rounded-xl hover:bg-zinc-100 transition-colors">
          <ChevronRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
          Ver Detalhamento de Gastos e Perfomance
        </summary>
        <div className="space-y-4 pt-2 pb-2 pl-2">
          {/* Old Secondary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="flex flex-col gap-1.5 p-4">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Bruto</span>
              </div>
              <p className="text-base font-black text-zinc-900">R$ {stats.totalEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </Card>
            <Card className="flex flex-col gap-1.5 p-4">
              <div className="flex items-center gap-1.5 text-orange-500">
                <Fuel className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Combustível</span>
              </div>
              <p className="text-base font-black text-orange-600">- R$ {stats.totalFuel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </Card>
            <Card className="flex flex-col gap-1.5 p-4">
              <div className="flex items-center gap-1.5 text-blue-500">
                <CarFront className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">KM Rodados</span>
              </div>
              <p className="text-base font-black text-blue-600">{stats.totalKm.toLocaleString('pt-BR')} km</p>
            </Card>
            <Card className="flex flex-col gap-1.5 p-4">
              <div className="flex items-center gap-1.5 text-amber-500">
                <span className="text-sm">🍽️</span>
                <span className="text-[10px] font-bold uppercase tracking-wider">Alimentação</span>
              </div>
              <p className="text-base font-black text-amber-600">- R$ {stats.totalFood.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </Card>
            {stats.totalOther > 0 && (
              <Card className="flex flex-col gap-1.5 p-4">
                <div className="flex items-center gap-1.5 text-purple-500">
                  <span className="text-sm">📦</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Outros</span>
                </div>
                <p className="text-base font-black text-purple-600">- R$ {stats.totalOther.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </Card>
            )}
            {stats.totalMaintenance > 0 && (
              <Card className="flex flex-col gap-1.5 p-4">
                <div className="flex items-center gap-1.5 text-rose-500">
                  <Wrench className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Oficina</span>
                </div>
                <p className="text-base font-black text-rose-600">- R$ {stats.totalMaintenance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </Card>
            )}
            {stats.autoExpenses > 0 && (
              <Card className="col-span-2 flex items-center justify-between p-4 border-rose-100 bg-rose-50/50">
                <div className="flex items-center gap-2 text-rose-500">
                  <Wrench className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {user?.vehicleType === "Alugado"
                      ? `Aluguel do Veículo (Ref. ${stats.workedDays} ${stats.workedDays === 1 ? 'dia' : 'dias'})\n`
                      : `Custos Fixos (Ref. ${stats.workedDays} ${stats.workedDays === 1 ? 'dia' : 'dias'})\n`}
                  </span>
                </div>
                <p className="text-base font-black text-rose-600">- R$ {stats.autoExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </Card>
            )}
          </div>

      {/* Productivity Coach */}
      {(() => {
        let dailyGoalNeeded = 0;
        let daysRemaining = 0;
        if (goal > 0 && stats.netProfit !== undefined) {
          const remainingGoal = goal - stats.netProfit;
          
          // To calculate the daily goal remaining, always use today as reference
          const today = startOfDay(new Date());
          const endOfMonthDate = endOfMonth(today);
          
          if (endOfMonthDate >= today) {
            daysRemaining = differenceInCalendarDays(endOfMonthDate, today) + 1;
            if (daysRemaining > 0 && remainingGoal > 0) {
              dailyGoalNeeded = remainingGoal / daysRemaining;
            }
          }
        }

        return (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-900 px-1">Produtividade</h3>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Card className="flex flex-col gap-1.5 p-4 border-emerald-100 bg-emerald-50/50">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Ganho real p/ KM</p>
                <p className="text-xl font-black text-emerald-700">R$ {stats.gainPerKm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-xs font-bold text-emerald-600/70 ml-1">/ km</span></p>
              </Card>
              <Card className="flex flex-col gap-1.5 p-4 border-blue-100 bg-blue-50/50">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ganho real p/ Hora</p>
                <p className="text-xl font-black text-blue-700">R$ {stats.gainPerHour.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-xs font-bold text-blue-600/70 ml-1">/ h</span></p>
              </Card>
              {dailyGoalNeeded > 0 && (
                <Card className="col-span-2 flex items-center justify-between p-4 border-purple-100 bg-purple-50/50">
                  <div className="flex items-center gap-2 text-purple-600">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Meta Diária Necessária
                      <span className="ml-1 text-[9px] opacity-70">(hoje é {format(new Date(), 'dd/MM/yyyy')})</span>
                    </span>
                  </div>
                  <p className="text-base font-black text-purple-700">R$ {dailyGoalNeeded.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </Card>
              )}
            </div>
          </div>
        );
      })()}

        </div>
      </details>

      {/* Chart */}
      <Card className="p-0 pt-6 border-zinc-100 shadow-sm">
        <div className="px-6 mb-4 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Dashboard</h3>
            <p className="text-[10px] text-zinc-500 font-medium">
              Ganhos vs Gastos ({
                {
                  "dia": "Hoje",
                  "semana": "Esta semana",
                  "mês": "Este mês",
                  "trimestre": "Este trimestre",
                  "semestre": "Este semestre",
                  "anual": "Este ano",
                  "personalizado": "Período personalizado"
                }[filter] ?? "Período"
              })
            </p>
          </div>
        </div>
        <div className="h-64 w-full px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...earnings].reverse()}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              barGap={8}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }}
                tickFormatter={(val) => {
                  try {
                    return format(parseLocalDate(val), 'dd/MM');
                  } catch (e) {
                    return val;
                  }
                }}
              />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: 'none',
                  borderRadius: '16px',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                  padding: '12px'
                }}
                cursor={{ fill: '#f8fafc' }}
                formatter={(value: any) => [`R$ ${value}`, '']}
                labelFormatter={(label) => {
                  try {
                    return format(parseLocalDate(label), "dd 'de' MMMM", { locale: ptBR });
                  } catch (e) {
                    return label;
                  }
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{
                  fontSize: '10px',
                  fontWeight: '700',
                  paddingBottom: '24px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              />
              <Bar
                name="Ganhos"
                dataKey="totalEarned"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                barSize={10}
              />
              <Bar
                name="Gastos"
                dataKey="fuelCost"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                barSize={10}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recent Earnings */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold">Lançamentos Recentes</h3>
          <button className="text-xs font-bold text-blue-500">Ver todos</button>
        </div>
        <div className="space-y-3">
          {earnings.length === 0 ? (
            <p className="text-center py-8 text-zinc-500 text-sm">Nenhum lançamento encontrado.</p>
          ) : (
            earnings.map(item_e => {
              const platforms = item_e.platformDetails || [];
              const totalExpenses = item_e.fuelCost + (item_e.foodCost || 0) + (item_e.otherCost || 0);
              const netProfit = item_e.totalEarned - totalExpenses;

              return (
                <Card 
                  key={item_e.id} 
                  onClick={() => onEditEarning(item_e)}
                  className="p-0 overflow-hidden border-zinc-100/80 shadow-sm active:scale-[0.99] transition-transform cursor-pointer hover:border-blue-200"
                >
                  <div className="flex items-center justify-between px-4 pt-4 pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex -space-x-2 flex-shrink-0">
                        {platforms.slice(0, 3).map((pd, i) => (
                          <div key={pd.name} className="ring-2 ring-white rounded-xl" style={{ zIndex: platforms.length - i }}>
                            <PlatformLogo name={pd.name} size="sm" />
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-zinc-900 truncate leading-tight">
                          {platforms.map(p => p.name).join(" + ")}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-medium">
                          {item_e.date ? format(parseLocalDate(item_e.date), "dd/MM/yyyy", { locale: ptBR }) : ""}
                          {item_e.km ? ` · ${item_e.km} km` : ""}
                        </p>
                      </div>
                    </div>
                    {/* Net value */}
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={cn("text-sm font-black", netProfit >= 0 ? "text-emerald-600" : "text-rose-500")}>
                        R$ {netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">LÍQUIDO</p>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-2">
                       <button 
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEditEarning(item_e);
                        }} 
                        className="p-1.5 text-zinc-400 hover:text-blue-500 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onDeleteEarning(item_e.id);
                        }} 
                        className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expenses row */}
                  <div className="border-t border-zinc-50 px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-[9px] text-zinc-400 uppercase font-bold">Combustível</p>
                        <p className="text-[11px] font-black text-rose-500">- R$ {item_e.fuelCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      {(item_e.foodCost || 0) > 0 && (
                        <>
                          <div className="w-px h-6 bg-zinc-100" />
                          <div className="text-center">
                            <p className="text-[9px] text-zinc-400 uppercase font-bold">Alimentação</p>
                            <p className="text-[11px] font-black text-rose-500">- R$ {(item_e.foodCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </>
                      )}
                      {(item_e.otherCost || 0) > 0 && (
                        <>
                          <div className="w-px h-6 bg-zinc-100" />
                          <div className="text-center">
                            <p className="text-[9px] text-zinc-400 uppercase font-bold">Outros</p>
                            <p className="text-[11px] font-black text-rose-500">- R$ {(item_e.otherCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="text-center flex-shrink-0">
                      <p className="text-[9px] text-zinc-400 uppercase font-bold">Bruto</p>
                      <p className="text-[11px] font-black text-zinc-500">R$ {item_e.totalEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function AddEarningScreen({ 
  platforms: initialPlatforms, 
  onAdd, 
  editingEarning,
  onCancel
}: { 
  platforms: Platform[]; 
  onAdd: (e: Earning) => void;
  editingEarning: Earning | null;
  onCancel: () => void;
}) {
  const [platforms, setPlatforms] = useState<Platform[]>(initialPlatforms);
  const [date, setDate] = useState(editingEarning?.date || format(new Date(), "yyyy-MM-dd"));
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    editingEarning?.platformDetails.map(p => p.name) || []
  );
  const [amounts, setAmounts] = useState<{ [key: string]: string }>(
    editingEarning?.platformDetails.reduce((acc, p) => ({ ...acc, [p.name]: p.amount.toString() }), {}) || {}
  );
  const [fuel, setFuel] = useState(editingEarning?.fuelCost.toString() || "");
  const [food, setFood] = useState(editingEarning?.foodCost?.toString() || "");
  const [otherCost, setOtherCost] = useState(editingEarning?.otherCost?.toString() || "");
  const [km, setKm] = useState(editingEarning?.km?.toString() || "");
  const [trips, setTrips] = useState(editingEarning?.trips?.toString() || "");
  const [hours, setHours] = useState(editingEarning?.hours?.toString() || "");
  const [showNewPlatformInput, setShowNewPlatformInput] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");

  const addNewPlatform = () => {
    if (newPlatformName && !platforms.includes(newPlatformName)) {
      setPlatforms([...platforms, newPlatformName]);
      togglePlatform(newPlatformName);
      setNewPlatformName("");
      setShowNewPlatformInput(false);
    }
  };

  const togglePlatform = (p: string) => {
    if (selectedPlatforms.includes(p)) {
      setSelectedPlatforms(selectedPlatforms.filter(x => x !== p));
      const newAmounts = { ...amounts };
      delete newAmounts[p];
      setAmounts(newAmounts);
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleAmountChange = (p: string, val: string) => {
    setAmounts({ ...amounts, [p]: val });
  };

  const totalEarned = selectedPlatforms.reduce((acc, p) => acc + parseLocalNumber(amounts[p]), 0);

  const handleSubmit = () => {
    if (selectedPlatforms.length === 0 || !fuel) return;

    const platformDetails = selectedPlatforms.map(p => ({
      name: p,
      amount: parseLocalNumber(amounts[p])
    }));

    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      date,
      platformDetails,
      totalEarned,
      fuelCost: parseLocalNumber(fuel),
      foodCost: food ? parseLocalNumber(food) : undefined,
      otherCost: otherCost ? parseLocalNumber(otherCost) : undefined,
      km: km ? parseLocalNumber(km) : undefined,
      trips: trips ? parseLocalNumber(trips) : undefined,
      hours: hours ? parseLocalNumber(hours) : undefined
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 pb-12"
    >
      <h2 className="text-2xl font-bold tracking-tight">
        {editingEarning ? "Editar Lançamento" : "Novo Lançamento"}
      </h2>

      <div className="space-y-6">
        <Input label="Data" type="date" value={date} onChange={setDate} />

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.15em] mb-0.5">Plataformas Trabalhadas</label>
          <div className="grid grid-cols-2 gap-2">
            {platforms.map(p => {
              const sel = selectedPlatforms.includes(p);
              const ps = getPlatformStyle(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "p-3 rounded-2xl border text-xs font-bold transition-all flex items-center gap-2",
                    sel ? `${ps.bg} ${ps.border}` : "bg-white border-zinc-200"
                  )}
                >
                  <PlatformLogo name={p} size="sm" />
                  <span className={sel ? ps.text : "text-zinc-600"}>{p}</span>
                  {sel && <Check className={cn("w-3 h-3 ml-auto", ps.text)} />}
                </button>
              );
            })}
            
            {!showNewPlatformInput && (
              <button
                onClick={() => setShowNewPlatformInput(true)}
                className="p-3 rounded-2xl border border-dashed border-zinc-300 text-[10px] font-bold text-zinc-400 flex items-center justify-center gap-2 hover:border-zinc-400 transition-colors"
              >
                + Nova Plataforma
              </button>
            )}
          </div>
          
          {showNewPlatformInput && (
            <div className="flex gap-2">
              <Input value={newPlatformName} onChange={(val) => setNewPlatformName(val)} placeholder="Nome do App" />
              <Button onClick={addNewPlatform} className="px-4 py-2 h-auto text-xs">Add</Button>
              <Button onClick={() => setShowNewPlatformInput(false)} variant="ghost" className="px-4 py-2 h-auto text-xs">X</Button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedPlatforms.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Ganhos por Plataforma</p>
                {selectedPlatforms.map(p => {
                  const ps = getPlatformStyle(p);
                  return (
                    <div key={p} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <PlatformLogo name={p} size="md" />
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-1">{p}</p>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-zinc-400 font-medium text-sm">R$</span>
                          <input
                            type="number"
                            value={amounts[p] || ''}
                            onChange={e => handleAmountChange(p, e.target.value)}
                            placeholder="0,00"
                            className="w-full pl-9 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-500">Total Bruto</span>
                  <span className="text-lg font-bold text-blue-600">R$ {totalEarned.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Input label="Gasto com Combustível" type="number" prefix="R$" value={fuel} onChange={setFuel} placeholder="0,00" />
        <Input label="🍽️  Alimentação (Opcional)" type="number" prefix="R$" value={food} onChange={setFood} placeholder="0,00" />
        <Input label="📦  Outros Gastos (Opcional)" type="number" prefix="R$" value={otherCost} onChange={setOtherCost} placeholder="0,00" />
        <div className="grid grid-cols-3 gap-2">
          <Input label="KM Rodados" type="number" value={km} onChange={setKm} placeholder="Ex: 120" />
          <Input label="Corridas" type="number" value={trips} onChange={setTrips} placeholder="Ex: 15" />
          <Input label="Horas Trabs" type="number" value={hours} onChange={setHours} placeholder="Ex: 8.5" />
        </div>

        <div className="pt-4 flex gap-3">
          {editingEarning && (
            <Button onClick={onCancel} variant="secondary" className="flex-1">Cancelar</Button>
          )}
          <Button onClick={handleSubmit} className="flex-[2]" disabled={selectedPlatforms.length === 0 || !fuel}>
            {editingEarning ? "Salvar Alterações" : "Salvar Lançamento"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function MaintenanceScreen({
  user,
  maintenance,
  onAdd,
  onUpdate,
  onDelete
}: {
  user: UserProfile | null;
  maintenance: Maintenance[];
  onAdd: (m: Maintenance) => void;
  onUpdate: (m: Maintenance) => void;
  onDelete: (id: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const isRented = user?.vehicleType === "Alugado";

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<string>(isRented ? "Outros" : "Manutenção");
  const [status, setStatus] = useState<"Realizada" | "Pendente">("Pendente");
  const [service, setService] = useState("");
  const [value, setValue] = useState("");

  const handleEdit = (m: Maintenance) => {
    setEditingId(m.id);
    setDate(m.date);
    setType(m.type);
    setStatus(m.status);
    setService(m.service);
    setValue(m.value.toString());
    setIsAdding(true);
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setService("");
    setValue("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setType(isRented ? "Outros" : "Manutenção");
    setStatus("Pendente");
  };

  const handleSubmit = () => {
    if (!service || !value) return;

    if (editingId) {
      onUpdate({
        id: editingId,
        date,
        type,
        service,
        value: parseLocalNumber(value),
        status
      });
    } else {
      onAdd({
        id: Math.random().toString(36).substr(2, 9),
        date,
        type,
        service,
        value: parseLocalNumber(value),
        status
      });
    }
    resetForm();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">
          {isRented ? "Imprevistos e Reparos" : "Manutenção"}
        </h2>
        <Button
          variant="ghost"
          onClick={() => isAdding ? resetForm() : setIsAdding(true)}
          className="p-2"
        >
          {isAdding ? "Cancelar" : <PlusCircle className="w-6 h-6 text-blue-500" />}
        </Button>
      </div>

      {isAdding && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-4 overflow-hidden"
        >
          <Card className="space-y-4 border-blue-600/30">
            <h3 className="text-sm font-bold text-blue-500">
              {editingId ? "Editar Registro" : "Novo Registro"}
            </h3>
            <Input label="Data" type="date" value={date} onChange={setDate} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Tipo</label>
              <div className="flex gap-2">
                {(isRented ? ["Pneu/Borracharia", "Lâmpadas", "Outros"] : ["Manutenção", "Revisão"]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={cn(
                      "flex-1 p-2 rounded-xl border text-[10px] font-bold transition-all",
                      type === t ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-white border-zinc-200 text-zinc-500"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Input label={isRented ? "O que aconteceu?" : "Serviço Realizado"} value={service} onChange={setService} placeholder={isRented ? "Ex: Furo no pneu traseiro" : "Ex: Troca de Óleo"} />
            <Input label="Valor do Serviço" type="number" prefix="R$" value={value} onChange={setValue} placeholder="0,00" />
            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</label>
              <div className="flex gap-2">
                {(["Pendente", "Realizada"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "flex-1 p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2",
                      status === s
                        ? s === "Realizada"
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-amber-400 border-amber-400 text-zinc-900"
                        : "bg-white border-zinc-200 text-zinc-500"
                    )}
                  >
                    {s === "Realizada" ? "✅" : "⏳"} {s}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleSubmit} className="w-full">
              {editingId ? "Salvar Alterações" : "Adicionar Registro"}
            </Button>
          </Card>
        </motion.div>
      )}

      <div className="space-y-4">
        {maintenance.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
            <p className="text-zinc-500">
              {isRented ? "Nenhum imprevisto registrado." : "Nenhum registro de manutenção."}
            </p>
          </div>
        ) : (
          maintenance.map(m => (
            <Card 
              key={m.id} 
              className={cn(
                "p-4 transition-all",
                m.status === "Realizada" ? "bg-emerald-50 border-emerald-200" : "bg-white border-zinc-100"
              )}
            >
              {/* Top row: icon + service name + status badge */}
              <div className="flex items-start gap-3 cursor-pointer" onClick={() => handleEdit(m)}>
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center mt-0.5",
                  m.type === "Revisão" ? "bg-purple-600/10 text-purple-500" : "bg-blue-600/10 text-blue-500"
                )}>
                  {m.type === "Revisão" ? <Calendar className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-zinc-900 truncate leading-tight">{m.service}</p>
                  <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                    {m.type} · {format(parseLocalDate(m.date), "dd/MM/yyyy")}
                  </p>
                </div>
                <span className={cn(
                  "flex-shrink-0 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full",
                  m.status === "Realizada"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                )}>
                  {m.status === "Realizada" ? "✅ Realizada" : "⏳ Pendente"}
                </span>
              </div>

              {/* Bottom row: value + quick toggle + actions */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                <p className="text-base font-black text-zinc-900">
                  R$ {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <div className="flex items-center gap-1">
                  {/* Quick toggle */}
                  <button
                    onClick={() => onUpdate({ ...m, status: m.status === "Realizada" ? "Pendente" : "Realizada" })}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                  >
                    {m.status === "Realizada" ? "Marcar Pendente" : "Marcar Realizada"}
                  </button>
                  <button onClick={() => handleEdit(m)} className="p-2 text-zinc-400 hover:text-blue-600 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => onDelete(m.id)} className="p-2 text-zinc-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function ProfileScreen({ user, onLogout, onUpdate, maintenanceAlertsEnabled, setMaintenanceAlertsEnabled }: {
  user: UserProfile | null;
  onLogout: () => void;
  onUpdate: (p: UserProfile) => void;
  maintenanceAlertsEnabled: boolean;
  setMaintenanceAlertsEnabled: (v: boolean) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"none" | "platforms" | "goals" | "notifications" | "vehicle">("none");
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [goal, setGoal] = useState(user?.monthlyGoal.toString() || "3000");
  const [customPlatform, setCustomPlatform] = useState("");
  const [vehicleName, setVehicleName] = useState(user?.vehicleName || "");
  const [licensePlate, setLicensePlate] = useState(user?.licensePlate || "");
  const [vehicleType, setVehicleType] = useState<"Alugado" | "Próprio">(user?.vehicleType || "Alugado");
  const [weeklyRent, setWeeklyRent] = useState(user?.weeklyRent?.toString() || "500");
  const [ipva, setIpva] = useState(user?.ipva?.toString() || "0");
  const [fines, setFines] = useState(user?.fines?.toString() || "0");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (user) {
      onUpdate({ ...user, name, avatar });
      setIsEditing(false);
    }
  };

  const handleSaveGoal = () => {
    if (user) {
      onUpdate({ ...user, monthlyGoal: parseLocalNumber(goal) });
      setActiveSection("none");
    }
  };

  const togglePlatform = (p: Platform) => {
    if (user) {
      const newPlatforms = user.platforms.includes(p)
        ? user.platforms.filter(x => x !== p)
        : [...user.platforms, p];
      onUpdate({ ...user, platforms: newPlatforms });
    }
  };

  const addPlatform = () => {
    if (customPlatform && user && !user.platforms.includes(customPlatform)) {
      onUpdate({ ...user, platforms: [...user.platforms, customPlatform] });
      setCustomPlatform("");
    }
  };

  const handleSaveVehicle = () => {
    if (user) {
      onUpdate({
        ...user,
        vehicleType,
        vehicleName,
        licensePlate,
        weeklyRent: vehicleType === "Alugado" ? parseLocalNumber(weeklyRent) : undefined,
        ipva: vehicleType === "Próprio" ? parseLocalNumber(ipva) : undefined,
        fines: vehicleType === "Próprio" ? parseLocalNumber(fines) : undefined
      });
      setActiveSection("none");
    }
  };

  if (activeSection === "platforms") {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveSection("none")} className="p-2 bg-white rounded-2xl border border-zinc-200 shadow-sm"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold tracking-tight">Minhas Plataformas</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {[...["Uber", "99 Pop", "InDrive"], ...(user?.platforms?.filter(p => !["Uber", "99 Pop", "InDrive"].includes(p)) || [])].map(p => {
              const sel = user?.platforms?.includes(p) ?? false;
              const ps = getPlatformStyle(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "p-4 rounded-2xl border text-sm font-semibold transition-all flex items-center gap-3",
                    sel ? `${ps.bg} ${ps.border}` : "bg-white border-zinc-200"
                  )}
                >
                  <PlatformLogo name={p} size="md" />
                  <span className={sel ? ps.text : "text-zinc-700"}>{p}</span>
                  {sel && <Check className={cn("w-4 h-4 ml-auto", ps.text)} />}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input value={customPlatform} onChange={setCustomPlatform} placeholder="Nova plataforma" />
            <Button onClick={addPlatform} className="px-6">Add</Button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (activeSection === "goals") {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveSection("none")} className="p-2 bg-white rounded-2xl border border-zinc-200 shadow-sm"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold tracking-tight">Minhas Metas</h2>
        </div>
        <div className="space-y-6">
          <Input label="Meta Mensal Líquida" type="number" prefix="R$" value={goal} onChange={setGoal} />
          <Button onClick={handleSaveGoal} className="w-full">Salvar Nova Meta</Button>
        </div>
      </motion.div>
    );
  }

  if (activeSection === "vehicle") {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveSection("none")} className="p-2 bg-white rounded-2xl border border-zinc-200 shadow-sm"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold tracking-tight">Meu Veículo</h2>
        </div>

        <div className="space-y-6">
          <div className="flex gap-2 bg-zinc-100 p-1 rounded-2xl">
            <button
              onClick={() => setVehicleType("Alugado")}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                vehicleType === "Alugado" ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500"
              )}
            >
              Alugado
            </button>
            <button
              onClick={() => setVehicleType("Próprio")}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-bold transition-all",
                vehicleType === "Próprio" ? "bg-white text-blue-600 shadow-sm" : "text-zinc-500"
              )}
            >
              Próprio
            </button>
          </div>

          {vehicleType === "Alugado" && (
            <div className="space-y-4">
              <Input label="Nome do Veículo" value={vehicleName} onChange={setVehicleName} placeholder="Ex: Toyota Corolla" />
              <Input label="Placa" value={licensePlate} onChange={setLicensePlate} placeholder="ABC-1234" />
              <Input label="Valor do Aluguel Semanal" type="number" prefix="R$" value={weeklyRent} onChange={setWeeklyRent} />
            </div>
          )}

          {vehicleType === "Próprio" && (
            <div className="space-y-4">
              <Input label="Nome do Veículo" value={vehicleName} onChange={setVehicleName} placeholder="Ex: Toyota Corolla" />
              <Input label="Placa" value={licensePlate} onChange={setLicensePlate} placeholder="ABC-1234" />
              <Input label="IPVA Anual" type="number" prefix="R$" value={ipva} onChange={setIpva} />
              <Input label="Multas" type="number" prefix="R$" value={fines} onChange={setFines} />
            </div>
          )}

          <Button 
            onClick={async () => {
              setIsSaving(true);
              try {
                await handleSaveVehicle();
                // Success feedback handled by parent update
              } finally {
                setIsSaving(false);
              }
            }} 
            className="w-full"
            disabled={isSaving}
          >
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </motion.div>
    );
  }

  if (activeSection === "notifications") {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setActiveSection("none")} className="p-2 bg-white rounded-2xl border border-zinc-200 shadow-sm"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-xl font-bold tracking-tight">Notificações</h2>
        </div>
        <Card className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-bold">Lembrete de Ganhos</p>
              <p className="text-xs text-zinc-500">Notificar se esquecer de lançar o dia</p>
            </div>
            <div className="w-12 h-6 bg-blue-600 rounded-full relative shadow-inner cursor-pointer"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" /></div>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-bold">Alertas de Manutenção</p>
              <p className="text-xs text-zinc-500">Avisar sobre revisões agendadas</p>
            </div>
            <div
              onClick={() => setMaintenanceAlertsEnabled(!maintenanceAlertsEnabled)}
              className={cn(
                "w-12 h-6 rounded-full relative transition-colors cursor-pointer",
                maintenanceAlertsEnabled ? "bg-blue-600 shadow-inner" : "bg-zinc-200"
              )}
            >
              <div
                className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                  maintenanceAlertsEnabled ? "right-1" : "left-1"
                )}
              />
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-zinc-50 border-2 border-zinc-100 overflow-hidden shadow-inner">
            <img src={avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <label className="absolute -bottom-2 -right-2 bg-blue-600 p-2 rounded-xl border-4 border-white cursor-pointer shadow-lg">
            <Camera className="w-4 h-4 text-white" />
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        </div>

        {/* Save Photo Button (only shows if avatar changed from user.avatar AND not in full edit mode) */}
        {!isEditing && avatar !== user?.avatar && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <p className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Foto alterada</p>
            <Button
              onClick={() => onUpdate({ ...user!, avatar })}
              className="px-6 py-2 h-auto text-xs"
            >
              Salvar Nova Foto
            </Button>
            <button
              onClick={() => setAvatar(user?.avatar || "")}
              className="text-[10px] text-zinc-400 font-bold hover:underline"
            >
              Descartar
            </button>
          </motion.div>
        )}

        {isEditing ? (
          <div className="w-full max-w-xs space-y-4">
            <Input label="Nome" value={name} onChange={setName} />
            <Button onClick={handleSave} className="w-full">Salvar Alterações</Button>
            <Button onClick={() => setIsEditing(false)} variant="ghost" className="w-full">Cancelar</Button>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="text-2xl font-bold">{user?.name}</h2>
            <p className="text-sm text-zinc-500">Motorista Parceiro</p>
            <button onClick={() => setIsEditing(true)} className="text-xs text-blue-500 font-bold mt-2">Editar Perfil</button>
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="space-y-4">
          <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">Configurações</h3>
          <Card className="divide-y divide-zinc-100 p-0 overflow-hidden">
            <ProfileItem onClick={() => setActiveSection("vehicle")} icon={<Fuel className="w-4 h-4" />} label="Meu Veículo" />
            <ProfileItem onClick={() => setActiveSection("platforms")} icon={<CarFront className="w-4 h-4" />} label="Minhas Plataformas" />
            <ProfileItem onClick={() => setActiveSection("goals")} icon={<TrendingUp className="w-4 h-4" />} label="Minhas Metas" />
            <ProfileItem onClick={() => setActiveSection("notifications")} icon={<Bell className="w-4 h-4" />} label="Notificações" />
          </Card>
        </div>
      )}

      <Button variant="danger" onClick={onLogout} className="w-full flex items-center justify-center gap-2">
        <LogOut className="w-4 h-4" />
        Sair da Conta
      </Button>
    </div>
  );
}

function ProfileItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="text-zinc-400">{icon}</div>
        <span className="text-sm font-medium text-zinc-900">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600" />
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactElement; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-2 px-3 transition-all relative"
    >
      <div className={cn(
        "w-12 h-8 rounded-2xl flex items-center justify-center transition-all",
        active ? "bg-blue-600 shadow-md shadow-blue-500/30" : "bg-transparent"
      )}>
        {React.cloneElement(icon, { className: cn("w-5 h-5", active ? "text-white" : "text-zinc-400") })}
      </div>
      <span className={cn("text-[10px] font-black tracking-wide", active ? "text-blue-600" : "text-zinc-400")}>{label}</span>
    </button>
  );
}
