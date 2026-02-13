export class ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  totalPages?: number;

  constructor(
    message: string,
    data: any = null,
    totalPages: number | undefined = undefined,
  ) {
    this.success = true;
    this.message = message;
    if (data !== null) {
      this.data = data;
    }
    if (totalPages !== undefined) this.totalPages = totalPages;
  }
}
