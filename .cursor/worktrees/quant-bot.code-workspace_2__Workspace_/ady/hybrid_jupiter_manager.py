#!/usr/bin/env python3
"""
Système de Swap Jupiter Hybride
- Essaie d'abord les vraies API Jupiter
- Bascule vers une simulation réaliste si les API échouent
- Intégration transparente avec le système existant
"""

import os
import asyncio
import logging
import httpx
import json
import time
import hashlib
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime
from dotenv import load_dotenv

load_dotenv('hybrid_bot_config.env')

logger = logging.getLogger(__name__)

@dataclass
class SwapResult:
    """Résultat d'un swap (réel ou simulé)"""
    success: bool
    input_token: str
    output_token: str
    input_amount: float
    output_amount: float
    price_impact: float
    slippage: float
    fees: float
    transaction_hash: str
    timestamp: datetime
    is_real_jupiter: bool = False
    route_info: Optional[Dict] = None
    error: Optional[str] = None

class HybridJupiterManager:
    """Gestionnaire de swaps Jupiter hybride"""
    
    def __init__(self):
        # Configuration Jupiter Ultra Beta (API fonctionnelle)
        self.jupiter_urls = [
            "https://ultra-api.jup.ag"
        ]
        self.jupiter_lite_url = "https://ultra-api.jup.ag"
        
        # Mode Jupiter Lite optimisé (simulation réaliste)
        self.jupiter_lite_mode = os.getenv('JUPITER_LITE_MODE', 'true').lower() == 'true'
        self.enhanced_simulation = os.getenv('ENHANCED_SIMULATION_MODE', 'true').lower() == 'true'
        self.realistic_simulation = os.getenv('REALISTIC_SWAP_SIMULATION', 'true').lower() == 'true'
        
        if self.jupiter_lite_mode:
            logger.info("🚀 Mode Jupiter Lite optimisé activé")
            logger.info("📊 Simulation réaliste des conditions de marché")
            logger.info("🔄 Fallback automatique vers simulation si API indisponible")
        else:
            logger.info("🔑 Mode Jupiter avec clé API")
        
        # Mode forcé pour les vraies transactions
        self.force_real_mode = False
        self.timeout = 10.0
        self.jupiter_available = False
        
        # Mapping des tokens
        self.token_mints = {
            "SOL": "So11111111111111111111111111111111111111112",
            "USDC": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "USDT": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            "RAY": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
            "SRM": "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
            "ORCA": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
            "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
            "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
            "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3"
        }
        
        # Prix de fallback (mis à jour périodiquement)
        self.fallback_prices = {
            "SOL": 185.0,
            "USDC": 1.0,
            "USDT": 1.0,
            "RAY": 1.8,
            "SRM": 0.01,
            "ORCA": 1.4,
            "BONK": 0.000014,
            "WIF": 0.5,
            "JUP": 0.35,
            "PYTH": 0.11
        }
        
        # Frais de trading réalistes
        self.trading_fees_usd = {
            "SOL": 0.50,
            "USDC": 0.01,
            "RAY": 0.25,
            "SRM": 0.20,
            "ORCA": 0.30,
            "BONK": 0.001,
            "WIF": 0.15,
            "JUP": 0.20,
            "PYTH": 0.10
        }
        
        self.swap_history: List[SwapResult] = []
        
        logger.info("🚀 HybridJupiterManager initialisé")
    
    async def test_jupiter_availability(self) -> bool:
        """Tester la disponibilité des API Jupiter"""
        try:
            sol_mint = self.token_mints["SOL"]
            usdc_mint = self.token_mints["USDC"]
            
            # Test avec 0.001 SOL
            amount = 1000000  # 0.001 SOL en lamports
            
            for url in self.jupiter_urls:
                try:
                    quote_url = f"{url}/quote"
                    params = {
                        "inputMint": sol_mint,
                        "outputMint": usdc_mint,
                        "amount": str(amount),
                        "slippageBps": 100
                    }
                    
                    # Headers pour Jupiter Lite (pas d'authentification)
                    headers = {}
                    if not self.jupiter_lite_mode and hasattr(self, 'api_key') and self.api_key:
                        headers["Authorization"] = f"Bearer {self.api_key}"
                    
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.get(quote_url, params=params, headers=headers)
                        
                        if response.status_code == 200:
                            data = response.json()
                            if "inAmount" in data and "outAmount" in data:
                                logger.info(f"✅ API Jupiter disponible: {url}")
                                self.jupiter_available = True
                                return True
                                
                except Exception as e:
                    logger.debug(f"❌ Test Jupiter {url} échoué: {e}")
                    continue
            
            logger.warning("⚠️ API Jupiter non disponibles, utilisation du mode simulation")
            self.jupiter_available = False
            return False
            
        except Exception as e:
            logger.error(f"❌ Erreur test Jupiter: {e}")
            self.jupiter_available = False
            return False
    
    async def get_jupiter_quote(
        self,
        input_token: str,
        output_token: str,
        amount: float,
        slippage_bps: int = 100
    ) -> Optional[Dict]:
        """Obtenir une quote Jupiter réelle"""
        try:
            input_mint = self.token_mints.get(input_token)
            output_mint = self.token_mints.get(output_token)
            
            if not input_mint or not output_mint:
                return None
            
            # Convertir le montant en unités minimales
            if input_token == "SOL":
                amount_lamports = int(amount * 1_000_000_000)
            else:
                amount_lamports = int(amount * 1_000_000)  # 6 décimales pour la plupart des tokens
            
            for url in self.jupiter_urls:
                try:
                    quote_url = f"{url}/quote"
                    params = {
                        "inputMint": input_mint,
                        "outputMint": output_mint,
                        "amount": str(amount_lamports),
                        "slippageBps": slippage_bps
                    }
                    
                    # Headers pour Jupiter Lite (pas d'authentification)
                    headers = {}
                    if not self.jupiter_lite_mode and hasattr(self, 'api_key') and self.api_key:
                        headers["Authorization"] = f"Bearer {self.api_key}"
                    
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        response = await client.get(quote_url, params=params, headers=headers)
                        
                        if response.status_code == 200:
                            data = response.json()
                            return data
                            
                except Exception as e:
                    logger.debug(f"❌ Quote Jupiter {url} échoué: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Erreur quote Jupiter: {e}")
            return None
    
    async def execute_realistic_swap(
        self,
        input_token: str,
        output_token: str,
        amount: float,
        wallet_address: str,
        slippage_percent: float = 1.0
    ) -> SwapResult:
        """Exécuter un swap réaliste (simulation)"""
        try:
            # Vérifier que les tokens sont supportés
            if input_token not in self.fallback_prices or output_token not in self.fallback_prices:
                return SwapResult(
                    success=False,
                    input_token=input_token,
                    output_token=output_token,
                    input_amount=amount,
                    output_amount=0.0,
                    price_impact=0.0,
                    slippage=slippage_percent,
                    fees=0.0,
                    transaction_hash="",
                    timestamp=datetime.now(),
                    is_real_jupiter=False,
                    error=f"Token non supporté: {input_token} ou {output_token}"
                )
            
            # Vérifier que ce n'est pas un swap identique
            if input_token == output_token:
                return SwapResult(
                    success=False,
                    input_token=input_token,
                    output_token=output_token,
                    input_amount=amount,
                    output_amount=amount,
                    price_impact=0.0,
                    slippage=slippage_percent,
                    fees=0.0,
                    transaction_hash="",
                    timestamp=datetime.now(),
                    is_real_jupiter=False,
                    error="Impossible de swapper un token avec lui-même"
                )
            
            logger.info(f"🔄 Swap réaliste: {amount} {input_token} → {output_token}")
            
            # Obtenir les prix
            input_price = self.fallback_prices[input_token]
            output_price = self.fallback_prices[output_token]
            
            # Montant en USD
            input_usd = amount * input_price
            
            # Montant de sortie théorique
            output_amount_theoretical = input_usd / output_price
            
            # Appliquer le slippage
            slippage_factor = 1.0 - (slippage_percent / 100.0)
            output_amount_with_slippage = output_amount_theoretical * slippage_factor
            
            # Calculer les frais
            fees_usd = self.trading_fees_usd.get(input_token, 0.10)
            fees_token = fees_usd / input_price
            
            # Calculer le price impact
            if input_usd < 100:
                price_impact = slippage_percent * 0.3
            elif input_usd < 1000:
                price_impact = slippage_percent * 0.5
            else:
                price_impact = slippage_percent * 0.8
            
            price_impact = min(price_impact, 5.0)
            
            # Générer un hash de transaction réaliste
            tx_data = f"{wallet_address}_{input_token}_{output_token}_{amount}_{int(time.time())}"
            transaction_hash = hashlib.sha256(tx_data.encode()).hexdigest()[:32]
            
            # Simuler le délai de confirmation
            confirmation_delay = 1.0 + (input_usd / 10000)
            await asyncio.sleep(min(confirmation_delay, 3.0))
            
            # Créer le résultat
            result = SwapResult(
                success=True,
                input_token=input_token,
                output_token=output_token,
                input_amount=amount,
                output_amount=output_amount_with_slippage,
                price_impact=price_impact,
                slippage=slippage_percent,
                fees=fees_token,
                transaction_hash=transaction_hash,
                timestamp=datetime.now(),
                is_real_jupiter=False,
                route_info={
                    "input_price_usd": input_price,
                    "output_price_usd": output_price,
                    "input_usd": input_usd,
                    "output_usd": output_amount_with_slippage * output_price,
                    "fees_usd": fees_usd,
                    "mode": "simulation"
                }
            )
            
            logger.info(f"✅ Swap réaliste réussi: {amount} {input_token} → {output_amount_with_slippage:.6f} {output_token}")
            logger.info(f"💰 Valeur: ${input_usd:.2f} → ${result.route_info['output_usd']:.2f}")
            logger.info(f"💸 Frais: ${fees_usd:.2f}")
            logger.info(f"📈 Price impact: {price_impact:.2f}%")
            logger.info(f"🔗 TX: {transaction_hash}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Erreur swap réaliste: {e}")
            return SwapResult(
                success=False,
                input_token=input_token,
                output_token=output_token,
                input_amount=amount,
                output_amount=0.0,
                price_impact=0.0,
                slippage=slippage_percent,
                fees=0.0,
                transaction_hash="",
                timestamp=datetime.now(),
                is_real_jupiter=False,
                error=str(e)
            )
    
    async def execute_swap(
        self,
        input_token: str,
        output_token: str,
        amount: float,
        wallet_address: str,
        slippage_percent: float = 1.0
    ) -> SwapResult:
        """Exécuter un swap (Jupiter réel ou simulation)"""
        try:
            # En mode force_real_mode, NE PAS basculer vers simulation
            if self.force_real_mode:
                logger.warning("🚀 MODE RÉEL FORCÉ - Pas de fallback simulation")
                # Tester Jupiter si pas encore testé
                if not self.jupiter_available:
                    await self.test_jupiter_availability()
                
                if not self.jupiter_available:
                    return SwapResult(
                        success=False,
                        input_token=input_token,
                        output_token=output_token,
                        input_amount=amount,
                        output_amount=0.0,
                        price_impact=0.0,
                        slippage=slippage_percent,
                        fees=0.0,
                        transaction_hash="",
                        timestamp=datetime.now(),
                        is_real_jupiter=False,
                        error="API Jupiter non disponible en mode réel forcé"
                    )
            
            # Tester Jupiter d'abord (sauf si mode forcé)
            if not self.jupiter_available and not self.force_real_mode:
                await self.test_jupiter_availability()
            
            # Essayer Jupiter si disponible ou mode forcé
            if self.jupiter_available or self.force_real_mode:
                slippage_bps = int(slippage_percent * 100)
                jupiter_quote = await self.get_jupiter_quote(
                    input_token=input_token,
                    output_token=output_token,
                    amount=amount,
                    slippage_bps=slippage_bps
                )
                
                if jupiter_quote:
                    # Utiliser la quote Jupiter réelle
                    logger.info(f"🌐 Utilisation API Jupiter réelle")
                    
                    # Convertir les montants
                    if output_token == "SOL":
                        output_amount = int(jupiter_quote["outAmount"]) / 1_000_000_000
                    else:
                        output_amount = int(jupiter_quote["outAmount"]) / 1_000_000
                    
                    # MODE SIMULATION AVEC PRIX RÉELS
                    # Générer un hash de transaction simulé (pour tracking)
                    tx_data = f"{wallet_address}_{input_token}_{output_token}_{amount}_{int(time.time())}"
                    transaction_hash = hashlib.sha256(tx_data.encode()).hexdigest()[:32]
                    
                    # Calculer les frais réels basés sur Jupiter
                    fees_usd = self.trading_fees_usd.get(input_token, 0.10)
                    fees_token = fees_usd / self.fallback_prices.get(input_token, 1.0)
                    
                    result = SwapResult(
                        success=True,
                        input_token=input_token,
                        output_token=output_token,
                        input_amount=amount,
                        output_amount=output_amount,
                        price_impact=float(jupiter_quote.get("priceImpactPct", "0")),
                        slippage=slippage_percent,
                        fees=fees_token,
                        transaction_hash=transaction_hash,
                        timestamp=datetime.now(),
                        is_real_jupiter=False,  # Simulation avec prix réels
                        route_info={
                            "jupiter_quote": jupiter_quote,
                            "mode": "simulation_with_real_prices",
                            "fees_usd": fees_usd,
                            "note": "Transaction simulée avec prix réels Jupiter"
                        }
                    )
                    
                    logger.info(f"🧪 [SIMULATION] Swap avec prix réels Jupiter: {amount} {input_token} → {output_amount:.6f} {output_token}")
                    logger.info(f"📈 Price impact réel: {result.price_impact:.2f}%")
                    logger.info(f"💰 Frais estimés: ${fees_usd:.2f}")
                    logger.info(f"🔗 TX simulé: {transaction_hash}")
                    logger.info(f"ℹ️  Note: Transaction simulée - Aucun fond réel déplacé")
                    
                    self.swap_history.append(result)
                    return result
            
            # Fallback vers la simulation réaliste
            logger.info(f"🔄 Fallback vers simulation réaliste")
            result = await self.execute_realistic_swap(
                input_token=input_token,
                output_token=output_token,
                amount=amount,
                wallet_address=wallet_address,
                slippage_percent=slippage_percent
            )
            
            if result.success:
                self.swap_history.append(result)
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Erreur swap hybride: {e}")
            return SwapResult(
                success=False,
                input_token=input_token,
                output_token=output_token,
                input_amount=amount,
                output_amount=0.0,
                price_impact=0.0,
                slippage=slippage_percent,
                fees=0.0,
                transaction_hash="",
                timestamp=datetime.now(),
                is_real_jupiter=False,
                error=str(e)
            )
    
    async def execute_trading_swap(
        self,
        symbol: str,
        action: str,
        amount: float,
        wallet_id: str,
        confidence: float
    ) -> Dict[str, Any]:
        """Exécuter un swap pour une transaction de trading"""
        try:
            # Déterminer les tokens d'entrée et de sortie
            if action.lower() == "buy":
                input_token = "SOL"
                output_token = symbol
            elif action.lower() == "sell":
                input_token = symbol
                output_token = "SOL"
            else:
                return {
                    "success": False,
                    "error": f"Action non supportée: {action}"
                }
            
            # Déterminer l'adresse du portefeuille
            phantom_address = "6DvzpPPmm4uxj4yjCuDbo8YWUiFDC3fHUnwiHufoxPR4"
            wallet_address = phantom_address  # Utilisation exclusive de Phantom Wallet
            
            # Calculer le slippage basé sur la confiance
            base_slippage = max(0.5, 3.0 - (confidence * 2.5))
            
            # Ajouter un slippage supplémentaire pour les tokens volatils
            volatile_tokens = ["BONK", "WIF", "PYTH"]
            if symbol in volatile_tokens:
                base_slippage += 1.0
            
            logger.info(f"🎯 Swap trading hybride: {action} {amount} {symbol}")
            logger.info(f"🔄 Conversion: {input_token} → {output_token}")
            logger.info(f"📊 Slippage: {base_slippage:.1f}%")
            
            # Exécuter le swap
            result = await self.execute_swap(
                input_token=input_token,
                output_token=output_token,
                amount=amount,
                wallet_address=wallet_address,
                slippage_percent=base_slippage
            )
            
            if result.success:
                return {
                    "success": True,
                    "transaction_hash": result.transaction_hash,
                    "input_amount": result.input_amount,
                    "output_amount": result.output_amount,
                    "fees": result.fees,
                    "price_impact": result.price_impact,
                    "slippage": result.slippage,
                    "wallet_address": wallet_address,
                    "timestamp": result.timestamp.isoformat(),
                    "is_real_jupiter": result.is_real_jupiter,
                    "route_info": result.route_info
                }
            else:
                return {
                    "success": False,
                    "error": result.error,
                    "wallet_address": wallet_address,
                    "is_real_jupiter": result.is_real_jupiter
                }
                
        except Exception as e:
            logger.error(f"❌ Erreur swap trading hybride: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_swap_history(self) -> List[SwapResult]:
        """Obtenir l'historique des swaps"""
        return self.swap_history.copy()
    
    def get_trading_stats(self) -> Dict[str, Any]:
        """Obtenir les statistiques de trading"""
        history = self.swap_history
        
        if not history:
            return {
                "total_swaps": 0,
                "successful_swaps": 0,
                "jupiter_real_swaps": 0,
                "simulated_swaps": 0,
                "total_volume_usd": 0.0,
                "total_fees_usd": 0.0,
                "average_price_impact": 0.0,
                "success_rate": 0.0,
                "jupiter_availability": self.jupiter_available
            }
        
        successful_swaps = [s for s in history if s.success]
        jupiter_swaps = [s for s in successful_swaps if s.is_real_jupiter]
        simulated_swaps = [s for s in successful_swaps if not s.is_real_jupiter]
        
        total_volume_usd = sum(s.route_info.get("input_usd", 0) for s in successful_swaps if s.route_info)
        total_fees_usd = sum(s.route_info.get("fees_usd", 0) for s in successful_swaps if s.route_info)
        
        return {
            "total_swaps": len(history),
            "successful_swaps": len(successful_swaps),
            "jupiter_real_swaps": len(jupiter_swaps),
            "simulated_swaps": len(simulated_swaps),
            "success_rate": len(successful_swaps) / len(history) * 100,
            "jupiter_usage_rate": len(jupiter_swaps) / len(successful_swaps) * 100 if successful_swaps else 0,
            "total_volume_usd": total_volume_usd,
            "total_fees_usd": total_fees_usd,
            "average_price_impact": sum(s.price_impact for s in successful_swaps) / len(successful_swaps) if successful_swaps else 0.0,
            "jupiter_availability": self.jupiter_available
        }

# Test du système hybride
async def test_hybrid_jupiter_system():
    """Tester le système Jupiter hybride"""
    try:
        print("🧪 TEST DU SYSTÈME JUPITER HYBRIDE")
        print("=" * 60)
        
        manager = HybridJupiterManager()
        
        # Test de disponibilité Jupiter
        print("🔌 Test de disponibilité Jupiter...")
        jupiter_available = await manager.test_jupiter_availability()
        print(f"🌐 Jupiter disponible: {jupiter_available}")
        
        # Test swap SOL → USDC
        print("\n🔄 Test swap SOL → USDC (0.01 SOL)")
        result = await manager.execute_trading_swap(
            symbol="USDC",
            action="buy",
            amount=0.01,
            wallet_id="phantom_mainnet",
            confidence=0.75
        )
        
        if result["success"]:
            print(f"✅ Swap réussi!")
            print(f"💰 Montant sortie: {result['output_amount']:.6f} USDC")
            print(f"📈 Price impact: {result['price_impact']:.2f}%")
            print(f"💸 Frais: ${result['route_info']['fees_usd']:.2f}")
            print(f"🔗 TX: {result['transaction_hash']}")
            print(f"🌐 Mode: {'Jupiter réel' if result['is_real_jupiter'] else 'Simulation'}")
        else:
            print(f"❌ Échec swap: {result['error']}")
        
        # Test swap avec token volatil
        print("\n🔄 Test swap SOL → BONK (0.001 SOL)")
        result2 = await manager.execute_trading_swap(
            symbol="BONK",
            action="buy",
            amount=0.001,
            wallet_id="phantom_mainnet",
            confidence=0.70
        )
        
        if result2["success"]:
            print(f"✅ Swap réussi!")
            print(f"💰 Montant sortie: {result2['output_amount']:.0f} BONK")
            print(f"📈 Price impact: {result2['price_impact']:.2f}%")
            print(f"💸 Frais: ${result2['route_info']['fees_usd']:.2f}")
            print(f"🔗 TX: {result2['transaction_hash']}")
            print(f"🌐 Mode: {'Jupiter réel' if result2['is_real_jupiter'] else 'Simulation'}")
        else:
            print(f"❌ Échec swap: {result2['error']}")
        
        # Statistiques
        print("\n📊 Statistiques de trading:")
        stats = manager.get_trading_stats()
        for key, value in stats.items():
            print(f"  - {key}: {value}")
        
    except Exception as e:
        print(f"❌ Erreur test: {e}")

if __name__ == "__main__":
    asyncio.run(test_hybrid_jupiter_system())
