export interface HeroSlideInput {
  title: string;
  description?: string;
  link?: string;
  cta?: string;
  is_active?: boolean | string;
}

export interface HeroSlideQuery {
  is_active?: boolean | string;
  search?: string;
}
