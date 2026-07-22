import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { firebaseApp } from './config'

export const auth = getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
