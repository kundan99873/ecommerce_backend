export class ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  totalCounts?: number;

  constructor(
    message: string,
    data: any = null,
    totalCounts: number | undefined = undefined,
  ) {
    this.success = true;
    this.message = message;
    if (data !== null) {
      this.data = data;
    }
    if (totalCounts !== undefined) this.totalCounts = totalCounts;
  }
}
