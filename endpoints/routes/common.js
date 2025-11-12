import { ENDPOINTS } from '../../public/endpoints.js';
import { sendCall, validateCall } from '../utils/common.js';

export async function insertOrder() {
    validateCall({}, [], [], "insertOrder");
    const actionsBody = {
        actions: [
            {
                method: "insert",
                params: { notification: "correspondence" },
                acceptWarnings: [5008, 4224, 5388]
            }
        ],
        objectName: "myOrder",
        get: ["Order", "Admissions", "Payments", "Order::order_number"]
    };

    const { ORDER: ORDER_PATH } = ENDPOINTS;
    const resp = await sendCall(ORDER_PATH, actionsBody, true);
    return resp;
}

export async function redirectToViewOrder(orderData, res){
    const { orderNumber, transactionId, actionsJson, respJson, paymentMethod } = orderData;
    return res.json({
        success: true,
        redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
        transactionDetails: {
            success: true,
            transactionId,
            orderId: orderNumber || transactionId,
            timestamp: new Date().toISOString(),
            paymentMethod: paymentMethod || "N/A",
            status: "completed",
            updateResult: respJson,
            actionsResult: actionsJson
        }
    });
}