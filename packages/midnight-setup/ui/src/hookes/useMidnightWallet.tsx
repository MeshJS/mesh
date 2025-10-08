import { MidnightWalletContext } from '@/providers/MidnightWalletProvider'
import { useContext } from 'react'

export const useMidnightWallet = () => {
  const context = useContext(MidnightWalletContext)
  if(!context){
    return;
  }
  return context;
}

export default useMidnightWallet