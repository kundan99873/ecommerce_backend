export class ApiResponse {
  success: boolean;
  message: string;
  data: any;

  constructor(message: string, data: any = null) {
    this.success = true;
    this.message = message;
    this.data = data;
  }
}
