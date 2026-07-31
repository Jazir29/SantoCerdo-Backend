import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { customerSchema, addressSchema } from '../schemas';
import * as CustomerController from '../controllers/customer.controller';

const router = Router();

router.get('/',                                   CustomerController.list);
router.post('/',                validate(customerSchema), CustomerController.create);
router.put('/:id',              validate(customerSchema), CustomerController.update);
router.delete('/:id',                             CustomerController.remove);
router.put('/:id/favorite-address',               CustomerController.updateFavoriteAddress);
router.get('/:id/addresses',                      CustomerController.getAddresses);
router.post('/:id/addresses',   validate(addressSchema),  CustomerController.createAddress);
router.put('/:id/addresses/:addressId',  validate(addressSchema), CustomerController.updateAddress);
router.delete('/:id/addresses/:addressId',        CustomerController.deleteAddress);

export default router;
