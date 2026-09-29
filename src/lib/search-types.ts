export interface CrmSearchItem {
  id: string;
  name: string;
  subtitle: string;
  url: string;
}

export interface CrmSearchResults {
  contacts: CrmSearchItem[];
  companies: CrmSearchItem[];
  deals: CrmSearchItem[];
}
