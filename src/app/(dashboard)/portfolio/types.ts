// src/app/(dashboard)/portfolio/types.ts

export const SOURCE_OPTIONS = [
  { value: "PMS", label: "PMS" },
  { value: "FIVERR", label: "Fiverr" },
  { value: "UPWORK", label: "Upwork" },
  { value: "DIRECT_CLIENT", label: "Direct Client" },
  { value: "REFERRAL", label: "Referral" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "WEBSITE_LEAD", label: "Website Lead" },
  { value: "OTHER", label: "Other" },
] as const;

export const PROJECT_TYPE_OPTIONS = [
  { value: "BUSINESS_WEBSITE", label: "Business Website" },
  { value: "ECOMMERCE_STORE", label: "Ecommerce Store" },
  { value: "LANDING_PAGE", label: "Landing Page" },
  { value: "PORTFOLIO_WEBSITE", label: "Portfolio Website" },
  { value: "CRM", label: "CRM" },
  { value: "ERP", label: "ERP" },
  { value: "SAAS", label: "SaaS" },
  { value: "AI_APPLICATION", label: "AI Application" },
  { value: "MOBILE_APP", label: "Mobile App" },
  { value: "WEB_APPLICATION", label: "Web Application" },
  { value: "OTHER", label: "Other" },
] as const;

export const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const WEBSITE_BUILDER_OPTIONS = [
  { value: "WORDPRESS", label: "WordPress" },
  { value: "SHOPIFY", label: "Shopify" },
  { value: "NEXTJS", label: "Next.js" },
  { value: "REACT", label: "React" },
  { value: "GOHIGHLEVEL", label: "GoHighLevel" },
  { value: "WEBFLOW", label: "Webflow" },
  { value: "WIX", label: "Wix" },
  { value: "CUSTOM_DEVELOPMENT", label: "Custom Development" },
  { value: "OTHER", label: "Other" },
] as const;

export type OptionItem = { readonly value: string; readonly label: string };

export interface PortfolioItem {
  id: string;
  project_date: string | null;
  project_id: string | null;
  linked_project_id: string | null;
  project_name: string;
  customer_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  project_type: string | null;
  website_builder: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  website_url: string | null;
  figma_url: string | null;
  short_description: string | null;
  featured_image: string | null;
  gallery_images: string[];
  pdf_documents: string[];
  is_public: boolean;
  is_favorite: boolean; // ← NEW: shared across all users
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PortfolioFilters {
  search: string;
  source: string;
  project_type: string;
  website_builder: string;
  status: string;
  is_public: string;
  is_favorite: string; // ← NEW: filter by favorites
  date_from: string;
  date_to: string;
}
